import Anthropic from "@anthropic-ai/sdk";
import { runForcedTool } from "../llm";
import type { Destination, NormalizedInput, RoutingConfig, TriageResult } from "../types";

const SYSTEM = `You are the TRIAGE agent. Given a neutral evidence layer, classify the request
and pick its Jira destination.

- Choose "type": bug or feature.
- Pick a priority and a small set of useful labels.
- Choose "destination" ONLY from the projects and issue types listed in the user message.
  Never invent a project key or an issue type.
- Give a 1-2 sentence "reasoning" — it appears in the review queue and the demo.`;

/** Build the tool schema, constraining destination to what the config allows. */
export function buildSchema(config: RoutingConfig): Anthropic.Tool.InputSchema {
  const projectKeys = config.projects.map((p) => p.key);
  const issueTypes = [...new Set(config.projects.flatMap((p) => p.issueTypes))];

  return {
    type: "object",
    properties: {
      type: {
        type: "string",
        enum: ["bug", "feature"],
      },
      destination: {
        type: "object",
        properties: {
          projectKey: { type: "string", enum: projectKeys },
          issueType: { type: "string", enum: issueTypes },
          board: { type: "string" },
        },
        required: ["projectKey", "issueType"],
      },
      priority: {
        type: "string",
        enum: ["lowest", "low", "medium", "high", "highest"],
      },
      labels: { type: "array", items: { type: "string" } },
      confidence: { type: "number", description: "0-1 confidence in this classification." },
      reasoning: { type: "string", description: "1-2 sentences explaining the call." },
    },
    required: ["type", "destination", "priority", "labels", "confidence", "reasoning"],
  };
}

/**
 * Re-validate the model's destination against the config. The schema enums already
 * constrain it, but we double-check and fall back to the default project (and its
 * first issue type) so the pipeline never targets a nonexistent project.
 */
export function resolveDestination(picked: Destination, config: RoutingConfig): Destination {
  const project = config.projects.find((p) => p.key === picked.projectKey);
  if (project && project.issueTypes.includes(picked.issueType)) {
    return picked.board
      ? { projectKey: project.key, issueType: picked.issueType, board: picked.board }
      : { projectKey: project.key, issueType: picked.issueType };
  }

  const fallback =
    config.projects.find((p) => p.key === config.defaultProjectKey) ?? config.projects[0];
  console.warn(
    `[triage] destination "${picked.projectKey}/${picked.issueType}" not in config; ` +
      `falling back to "${fallback.key}/${fallback.issueTypes[0]}".`,
  );
  return { projectKey: fallback.key, issueType: fallback.issueTypes[0] };
}

/** Agent 2 — classify the evidence and pick an allowed destination. */
export async function triage(
  normalized: NormalizedInput,
  config: RoutingConfig,
): Promise<TriageResult> {
  const catalog = config.projects
    .map(
      (p) =>
        `- ${p.key} (${p.name}): ${p.description} | issue types: ${p.issueTypes.join(", ")}`,
    )
    .join("\n");

  const content =
    `Normalized evidence:\n${JSON.stringify(normalized, null, 2)}\n\n` +
    `Available projects (choose destination ONLY from these):\n${catalog}\n\n` +
    `Default project: ${config.defaultProjectKey}`;

  const result = await runForcedTool<TriageResult>({
    system: SYSTEM,
    content,
    toolName: "emit_triage_result",
    toolDescription: "Record the classification and Jira destination.",
    inputSchema: buildSchema(config),
  });

  return { ...result, destination: resolveDestination(result.destination, config) };
}
