/**
 * The contract for the three middle-of-pipeline agents:
 *   video --[normalize]--> NormalizedInput --[triage]--> TriageResult --[compose]--> ComposedContent
 *
 * normalize's input type is NormalizeVideoInput (agents/normalize-gemini.ts).
 * No logic lives here — just the shared types.
 */

/** Claude model constant for triage (re-exported from llm.ts). */
export const MODEL = "claude-sonnet-5";

// ───────────── Capture metadata (from the widget/upstream) ─────────────

export interface CaptureMetadata {
  url?: string;
  userAgent?: string;
  os?: string;
  browser?: string;
  appVersion?: string;
  timestamp?: string;
}

// ───────────── Agent 1 output: NormalizedInput (evidence layer) ─────────────

export type ObservationSource = "text" | "transcript" | "frame";

export interface Observation {
  statement: string;
  source: ObservationSource;
  /** Set only when source === "frame". */
  frameTimestampMs?: number;
}

export interface Entities {
  components?: string[];
  errorMessages?: string[];
  urls?: string[];
  userActions?: string[];
}

export interface Environment {
  url?: string;
  browser?: string;
  os?: string;
  appVersion?: string;
}

export interface NormalizedInput {
  /** Neutral 1-2 sentences. */
  summary: string;
  /** What the user wants, in THEIR framing — NOT a ticket type. */
  intent: string;
  observations: Observation[];
  entities: Entities;
  environment?: Environment;
  /** Verbatim standout phrases. */
  quotes: string[];
  /** Missing/unclear info. */
  gaps: string[];
  /** 0-1. */
  confidence: number;
  /** ISO timestamp of the capture, passed through from metadata (not model-generated). */
  capturedAt?: string;
}

// ───────────── Agent 2: triage ─────────────

export type TicketType = "bug" | "feature";
export type Priority = "lowest" | "low" | "medium" | "high" | "highest";

export interface Destination {
  projectKey: string;
  issueType: string;
  board?: string;
}

export interface TriageResult {
  type: TicketType;
  destination: Destination;
  priority: Priority;
  labels: string[];
  /** 0-1. */
  confidence: number;
  /** 1-2 sentences, for the review queue + demo. */
  reasoning: string;
}

// ───────────── Agent 3: compose ─────────────

/** Cites a step in stepsToReproduce as evidenced by a specific frame observation,
 * so the matching client-captured screenshot can be attached to that step. */
export interface StepScreenshotRef {
  /** 0-based index into stepsToReproduce. */
  stepIndex: number;
  /** Must match an actual "frame" observation's frameTimestampMs — never invented. */
  frameTimestampMs: number;
}

export interface BugContent {
  summary: string;
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  environment?: string;
  stepScreenshots?: StepScreenshotRef[];
}

export interface FeatureContent {
  summary: string;
  businessJustification: string;
  acceptanceCriteria: string[];
}

export type ComposedContent = BugContent | FeatureContent;

// ───────────── Routing config (triage's allowed choices) ─────────────

export interface ProjectConfig {
  key: string;
  name: string;
  description: string;
  issueTypes: string[];
}

export interface RoutingConfig {
  projects: ProjectConfig[];
  defaultProjectKey: string;
}

// ───────────── Wiring ─────────────

export interface PrepareTicketResult {
  normalized: NormalizedInput;
  triage: TriageResult;
  content: ComposedContent;
  /** true when either confidence < 0.6. */
  needsReview: boolean;
}
