import { describe, it, expect, vi, beforeEach } from "vitest";
import { runForcedTool } from "../llm";
import { compose } from "../agents/compose";
import type { BugContent, FeatureContent, NormalizedInput, TriageResult } from "../types";

vi.mock("../llm", () => ({ runForcedTool: vi.fn() }));
const mockRun = vi.mocked(runForcedTool);

const NORMALIZED: NormalizedInput = {
  summary: "s",
  intent: "i",
  observations: [],
  entities: {},
  quotes: [],
  gaps: [],
  confidence: 0.9,
};

function bugTriage(): TriageResult {
  return {
    type: "bug",
    destination: { projectKey: "WEB", issueType: "Bug" },
    priority: "high",
    labels: ["export"],
    confidence: 0.9,
    reasoning: "export fails with a 500",
  };
}

function featureTriage(): TriageResult {
  return {
    type: "feature",
    destination: { projectKey: "WEB", issueType: "Story" },
    priority: "medium",
    labels: [],
    confidence: 0.9,
    reasoning: "user wants bulk export",
  };
}

beforeEach(() => {
  mockRun.mockReset();
});

describe("compose", () => {
  it("requests the bug schema and returns the model's bug content", async () => {
    const bugContent: BugContent = {
      summary: "Export button fails with a 500",
      stepsToReproduce: ["Open the export page", "Click Export"],
      expectedBehavior: "The file downloads.",
      actualBehavior: "A 500 error appears instead.",
    };
    mockRun.mockResolvedValue(bugContent);

    const result = await compose(NORMALIZED, bugTriage());

    expect(result).toEqual(bugContent);
    const opts = mockRun.mock.calls[0][0];
    const props = opts.inputSchema.properties as any;
    expect(props.stepsToReproduce).toBeDefined();
    expect(opts.content).toContain("type=bug");
  });

  it("requests the feature schema and returns the model's feature content", async () => {
    const featureContent: FeatureContent = {
      summary: "Add bulk export",
      businessJustification: "Users need to export many records at once.",
      acceptanceCriteria: ["User can select multiple rows", "Export downloads a single file"],
    };
    mockRun.mockResolvedValue(featureContent);

    const result = await compose(NORMALIZED, featureTriage());

    expect(result).toEqual(featureContent);
    const opts = mockRun.mock.calls[0][0];
    const props = opts.inputSchema.properties as any;
    expect(props.businessJustification).toBeDefined();
    expect(opts.content).toContain("type=feature");
  });
});
