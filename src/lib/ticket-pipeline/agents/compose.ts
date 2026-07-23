import Anthropic from "@anthropic-ai/sdk";
import { runForcedTool } from "../llm";
import type { BugContent, ComposedContent, FeatureContent, NormalizedInput, TriageResult } from "../types";

const SYSTEM = `You are the COMPOSE agent. Given the neutral evidence layer and the
triage decision (bug vs feature), write the actual Jira ticket content a human
would read — clear, well-formed prose, not a copy of the raw evidence fields.

- "summary" is a short, specific title (not a generic restatement of the evidence summary).
- For bugs: write "stepsToReproduce" as an ordered, concrete list a developer could
  follow, "expectedBehavior" and "actualBehavior" as full sentences, and "environment"
  as a short line (browser/OS/URL) if known.
- For features: write "businessJustification" as 1-2 sentences explaining why this
  matters, and "acceptanceCriteria" as a checklist of concrete, testable statements.
- Only use facts present in the evidence layer — never invent details, error text,
  or steps that aren't supported by an observation, quote, or entity.
- For bugs: the evidence layer's "observations" array may include entries with
  source "frame" and a frameTimestampMs — these mark a specific moment in the
  recording. When a step in "stepsToReproduce" is directly evidenced by one of
  those frame observations, add an entry to "stepScreenshots" citing that step's
  0-based index and that exact frameTimestampMs, so the matching screenshot can be
  attached under that step. Only cite a frameTimestampMs that actually appears on
  a "frame" observation in the evidence — never invent or approximate one. Omit
  "stepScreenshots" entirely if no step has direct frame evidence.`;

const BUG_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    stepsToReproduce: { type: "array", items: { type: "string" } },
    expectedBehavior: { type: "string" },
    actualBehavior: { type: "string" },
    environment: { type: "string" },
    stepScreenshots: {
      type: "array",
      description:
        "Steps directly evidenced by a specific frame observation, citing that step's index and the observation's frameTimestampMs.",
      items: {
        type: "object",
        properties: {
          stepIndex: { type: "number", description: "0-based index into stepsToReproduce." },
          frameTimestampMs: {
            type: "number",
            description: "Must match an actual frame observation's frameTimestampMs from the evidence.",
          },
        },
        required: ["stepIndex", "frameTimestampMs"],
      },
    },
  },
  required: ["summary", "stepsToReproduce", "expectedBehavior", "actualBehavior"],
};

const FEATURE_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    businessJustification: { type: "string" },
    acceptanceCriteria: { type: "array", items: { type: "string" } },
  },
  required: ["summary", "businessJustification", "acceptanceCriteria"],
};

function buildContent(normalized: NormalizedInput, triage: TriageResult): string {
  return (
    `Normalized evidence:\n${JSON.stringify(normalized, null, 2)}\n\n` +
    `Triage decision: type=${triage.type}, priority=${triage.priority}\n` +
    `Reasoning: ${triage.reasoning}`
  );
}

/** Agent 3 — write the actual Jira ticket content from the evidence + triage decision. */
export async function compose(normalized: NormalizedInput, triage: TriageResult): Promise<ComposedContent> {
  const content = buildContent(normalized, triage);

  if (triage.type === "bug") {
    return runForcedTool<BugContent>({
      system: SYSTEM,
      content,
      toolName: "emit_ticket_content",
      toolDescription: "Record the composed bug ticket content.",
      inputSchema: BUG_SCHEMA,
    });
  }

  return runForcedTool<FeatureContent>({
    system: SYSTEM,
    content,
    toolName: "emit_ticket_content",
    toolDescription: "Record the composed feature ticket content.",
    inputSchema: FEATURE_SCHEMA,
  });
}
