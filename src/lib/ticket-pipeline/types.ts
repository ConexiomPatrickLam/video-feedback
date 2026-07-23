/**
 * The contract for the two middle-of-pipeline agents:
 *   video --[normalize]--> NormalizedInput --[triage]--> TriageResult
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
  /** true when either confidence < 0.6. */
  needsReview: boolean;
}
