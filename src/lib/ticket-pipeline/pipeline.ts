import { normalizeVideo, isGeminiQuotaError, type NormalizeVideoInput } from "./agents/normalize-gemini";
import { normalizeTextOnly } from "./agents/normalize-text";
import { triage } from "./agents/triage";
import { compose } from "./agents/compose";
import { sleep } from "./sleep";
import type { NormalizedInput, PrepareTicketResult, RoutingConfig } from "./types";

/** Below this, the ticket is sent to the human review queue instead of auto-filed. */
export const CONFIDENCE_THRESHOLD = 0.6;

/** A typed note at least this long is treated as sufficient on its own — skip Gemini
 * entirely rather than spend free-tier quota analyzing the video too. */
const SUBSTANTIAL_TEXT_LENGTH = 40;

/** Backoff delays (ms) between retries of a Gemini quota/rate-limit error. */
const GEMINI_RETRY_DELAYS_MS = [1500, 4000];

/**
 * Log DERIVED output only (never the raw capture / base64 frames), so we can see
 * what each agent produced when running the app.
 */
function logStage(label: string, value: unknown): void {
  console.log(`[ticket-pipeline] ${label}:\n${JSON.stringify(value, null, 2)}`);
}

/** Try Gemini, retrying a couple of times on a quota/rate-limit error before giving up. */
async function normalizeVideoWithRetry(input: NormalizeVideoInput): Promise<NormalizedInput> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await normalizeVideo(input);
    } catch (err) {
      if (!isGeminiQuotaError(err) || attempt >= GEMINI_RETRY_DELAYS_MS.length) throw err;
      const delay = GEMINI_RETRY_DELAYS_MS[attempt];
      console.warn(
        `[ticket-pipeline] Gemini quota/rate-limit hit — retrying in ${delay}ms ` +
          `(attempt ${attempt + 2}/${GEMINI_RETRY_DELAYS_MS.length + 1}).`,
      );
      await sleep(delay);
    }
  }
}

/**
 * Video-native pipeline: Gemini reads the raw recording (video + audio) to
 * produce the evidence layer, Claude triages it, then Claude composes the
 * actual ticket content. No frame extraction / transcription needed upstream
 * — the server hands the recording straight in.
 *
 * Skips Gemini entirely (and its free-tier quota) whenever the typed note is
 * already substantial; otherwise retries transient Gemini throttling before
 * falling back to a Claude-only text normalize.
 */
export async function prepareTicketFromVideo(
  input: NormalizeVideoInput,
  routing: RoutingConfig,
): Promise<PrepareTicketResult> {
  const trimmedTextLength = input.text?.trim().length ?? 0;

  let normalized: NormalizedInput;
  if (trimmedTextLength >= SUBSTANTIAL_TEXT_LENGTH) {
    console.log(
      "[ticket-pipeline] Typed note is substantial — skipping Gemini, normalizing from text alone.",
    );
    normalized = await normalizeTextOnly({ text: input.text, metadata: input.metadata });
  } else {
    try {
      normalized = await normalizeVideoWithRetry(input);
    } catch (err) {
      if (!isGeminiQuotaError(err)) throw err;
      // No video (quota, even after retries) AND no note → nothing to build a
      // ticket from. Bail instead of filing a junk ticket from metadata alone.
      if (!input.text?.trim()) {
        throw new Error(
          "Gemini quota exhausted and no typed note provided — cannot build a ticket without the video or any text.",
        );
      }
      console.warn(
        "[ticket-pipeline] Gemini quota exhausted after retries — falling back to Claude text-only normalize (no video).",
      );
      normalized = await normalizeTextOnly({ text: input.text, metadata: input.metadata });
    }
  }
  logStage("normalized", normalized);

  const triageResult = await triage(normalized, routing);
  logStage("triage", triageResult);

  const content = await compose(normalized, triageResult);
  logStage("composed", content);

  const needsReview =
    normalized.confidence < CONFIDENCE_THRESHOLD ||
    triageResult.confidence < CONFIDENCE_THRESHOLD;

  return { normalized, triage: triageResult, content, needsReview };
}
