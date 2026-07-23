import { describe, it, expect } from "vitest";
import { toTicketInput } from "../to-jira-input";
import type { BugContent, FeatureContent, TriageResult } from "../types";

function tri(type: "bug" | "feature"): TriageResult {
  return {
    type,
    destination: { projectKey: "WEB", issueType: "Bug" },
    priority: "high",
    labels: [],
    confidence: 0.9,
    reasoning: "r",
  };
}

describe("toTicketInput summary cap", () => {
  it("caps a long bug summary at Jira's 255-char limit", () => {
    const content: BugContent = {
      summary: "x".repeat(400),
      stepsToReproduce: [],
      expectedBehavior: "e",
      actualBehavior: "a",
    };
    const out = toTicketInput(content, tri("bug"));
    expect(out.summary.length).toBeLessThanOrEqual(255);
    expect(out.summary.endsWith("…")).toBe(true);
  });

  it("leaves a short feature summary untouched", () => {
    const content: FeatureContent = {
      summary: "short",
      businessJustification: "b",
      acceptanceCriteria: [],
    };
    expect(toTicketInput(content, tri("feature")).summary).toBe("short");
  });
});
