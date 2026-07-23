/** Public surface for the orchestration layer. */
export * from "./types";
export {
  normalizeVideo,
  GEMINI_MODEL,
  type NormalizeVideoInput,
} from "./agents/normalize-gemini";
export { triage } from "./agents/triage";
export { compose } from "./agents/compose";
export { prepareTicketFromVideo, CONFIDENCE_THRESHOLD } from "./pipeline";
