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
  or steps that aren't supported by an observation, quote, or entity.`;

const BUG_SCHEMA: Anthropic.Tool.InputSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    stepsToReproduce: { type: "array", items: { type: "string" } },
    expectedBehavior: { type: "string" },
    actualBehavior: { type: "string" },
    environment: { type: "string" },
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
