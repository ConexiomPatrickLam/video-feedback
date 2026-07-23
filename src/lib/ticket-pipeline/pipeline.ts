import { normalizeVideo, isGeminiQuotaError, type NormalizeVideoInput } from "./agents/normalize-gemini";
import { normalizeTextOnly } from "./agents/normalize-text";
import { triage } from "./agents/triage";
import { compose } from "./agents/compose";
import type { NormalizedInput, PrepareTicketResult, RoutingConfig } from "./types";

/** Below this, the ticket is sent to the human review queue instead of auto-filed. */
export const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Log DERIVED output only (never the raw capture / base64 frames), so we can see
 * what each agent produced when running the app.
 */
function logStage(label: string, value: unknown): void {
  console.log(`[ticket-pipeline] ${label}:\n${JSON.stringify(value, null, 2)}`);
}

/**
 * Video-native pipeline: Gemini reads the raw recording (video + audio) to
 * produce the evidence layer, Claude triages it, then Claude composes the
 * actual ticket content. No frame extraction / transcription needed upstream
 * — the server hands the recording straight in.
 */
export async function prepareTicketFromVideo(
  input: NormalizeVideoInput,
  routing: RoutingConfig,
): Promise<PrepareTicketResult> {
  // Prefer Gemini (reads the video). If its quota is exhausted, fall back to a
  // Claude text-only normalize — no video, just the typed note + metadata.
  let normalized: NormalizedInput;
  try {
    normalized = await normalizeVideo(input);
  } catch (err) {
    if (!isGeminiQuotaError(err)) throw err;
    // No video (quota) AND no note → nothing to build a ticket from. Bail instead
    // of filing a junk ticket from metadata alone.
    if (!input.text?.trim()) {
      throw new Error(
        "Gemini quota exhausted and no typed note provided — cannot build a ticket without the video or any text.",
      );
    }
    console.warn(
      "[ticket-pipeline] Gemini quota exhausted — falling back to Claude text-only normalize (no video).",
    );
    normalized = await normalizeTextOnly({ text: input.text, metadata: input.metadata });
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
