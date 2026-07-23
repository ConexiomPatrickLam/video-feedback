import { normalizeVideo, type NormalizeVideoInput } from "./agents/normalize-gemini";
import { triage } from "./agents/triage";
import type { PrepareTicketResult, RoutingConfig } from "./types";

/** Below this, the ticket is sent to the human review queue instead of auto-filed. */
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Log DERIVED output only (never the raw capture / base64 frames), so we can see
 * what each agent produced when running the app.
 */
function logStage(label: string, value: unknown): void {
  console.log(`[ticket-pipeline] ${label}:\n${JSON.stringify(value, null, 2)}`);
}

/**
 * Video-native pipeline: Gemini reads the raw recording (video + audio) to
 * produce the evidence layer, then Claude triages it. No frame extraction /
 * transcription needed upstream — the server hands the recording straight in.
 */
export async function prepareTicketFromVideo(
  input: NormalizeVideoInput,
  routing: RoutingConfig,
): Promise<PrepareTicketResult> {
  const normalized = await normalizeVideo(input);
  logStage("normalized", normalized);

  const triageResult = await triage(normalized, routing);
  logStage("triage", triageResult);

  const needsReview =
    normalized.confidence < CONFIDENCE_THRESHOLD ||
    triageResult.confidence < CONFIDENCE_THRESHOLD;

  return { normalized, triage: triageResult, needsReview };
}
