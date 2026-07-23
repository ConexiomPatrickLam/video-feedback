import Anthropic from "@anthropic-ai/sdk";
import { MODEL } from "./types";

/** Single swappable model constant. */
export { MODEL };

/** One shared client. Reads ANTHROPIC_API_KEY (or an `ant auth login` profile) from the env. */
export const client = new Anthropic();

/**
 * Structured output via FORCED TOOL USE: define exactly one tool, force the model
 * to call it, and return its validated input. No JSON-out-of-prose parsing.
 */
export async function runForcedTool<T>(opts: {
  system: string;
  content: string | Anthropic.ContentBlockParam[];
  toolName: string;
  toolDescription: string;
  inputSchema: Anthropic.Tool.InputSchema;
  maxTokens?: number;
}): Promise<T> {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: opts.maxTokens ?? 4096,
    system: opts.system,
    tools: [
      {
        name: opts.toolName,
        description: opts.toolDescription,
        input_schema: opts.inputSchema,
      },
    ],
    tool_choice: { type: "tool", name: opts.toolName },
    messages: [{ role: "user", content: opts.content }],
  });

  const block = response.content.find((b) => b.type === "tool_use");
  if (!block || block.type !== "tool_use") {
    throw new Error(`Model did not call the forced tool "${opts.toolName}".`);
  }
  return block.input as T;
}
