import Anthropic from "@anthropic-ai/sdk";
import { runForcedTool } from "../llm";
import type { CaptureMetadata, NormalizedInput } from "../types";

const SYSTEM = `You are the NORMALIZE agent — a ticket-type-neutral evidence layer.

This is the TEXT-ONLY fallback: you are given ONLY the user's typed note (and optional
capture metadata). No screen recording is available this time. Extract what is TRUE
from the text alone.

- Answer only "what is TRUE here?". Do NOT decide the ticket type (bug/feature), write
  any ticket title/description, or use bug-specific framing like "steps to reproduce".
- Every observation you record has source "text" (there is no video or audio).
- Never invent UI state, errors, actions, URLs, or environment beyond what the note or
  metadata actually say.
- Add a gap noting that no recording was analyzed, and keep confidence modest since the
  visual evidence is missing.`;

const INPUT_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    intent: { type: "string" },
    observations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          statement: { type: "string" },
          source: { type: "string", enum: ["text", "transcript", "frame"] },
          frameTimestampMs: { type: "number" },
        },
        required: ["statement", "source"],
      },
    },
    entities: {
      type: "object",
      properties: {
        components: { type: "array", items: { type: "string" } },
        errorMessages: { type: "array", items: { type: "string" } },
        urls: { type: "array", items: { type: "string" } },
        userActions: { type: "array", items: { type: "string" } },
      },
    },
    environment: {
      type: "object",
      properties: {
        url: { type: "string" },
        browser: { type: "string" },
        os: { type: "string" },
        appVersion: { type: "string" },
      },
    },
    quotes: { type: "array", items: { type: "string" } },
    gaps: { type: "array", items: { type: "string" } },
    confidence: { type: "number" },
  },
  required: ["summary", "intent", "observations", "entities", "quotes", "gaps", "confidence"],
};

export interface NormalizeTextInput {
  text?: string;
  metadata?: CaptureMetadata;
}

/**
 * Agent 1 fallback (Claude, text-only) — used when the Gemini video normalize is
 * unavailable (e.g. quota exhausted). Claude can't read the video, so this derives
 * the evidence layer from the user's typed note + metadata alone.
 */
export async function normalizeTextOnly(input: NormalizeTextInput): Promise<NormalizedInput> {
  const parts: string[] = [
    input.text ? `User's typed note:\n${input.text}` : "(no typed note provided)",
  ];
  if (input.metadata) parts.push(`Capture metadata:\n${JSON.stringify(input.metadata, null, 2)}`);

  const normalized = await runForcedTool<NormalizedInput>({
    system: SYSTEM,
    content: parts.join("\n\n"),
    toolName: "emit_normalized_input",
    toolDescription: "Record the neutral evidence extracted from the text.",
    inputSchema: INPUT_SCHEMA,
  });

  if (input.metadata?.timestamp) normalized.capturedAt = input.metadata.timestamp;
  return normalized;
}
