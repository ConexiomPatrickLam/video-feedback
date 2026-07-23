import { describe, it, expect, vi, beforeEach } from "vitest";
import { runForcedTool } from "../llm";
import { buildSchema, resolveDestination, triage } from "../agents/triage";
import type { NormalizedInput, RoutingConfig, TriageResult } from "../types";

vi.mock("../llm", () => ({ runForcedTool: vi.fn() }));
const mockRun = vi.mocked(runForcedTool);

const CONFIG: RoutingConfig = {
  projects: [
    { key: "WEB", name: "Web", description: "web", issueTypes: ["Bug", "Story"] },
    { key: "PLAT", name: "Platform", description: "backend", issueTypes: ["Task"] },
  ],
  defaultProjectKey: "WEB",
};

const NORMALIZED: NormalizedInput = {
  summary: "s",
  intent: "i",
  observations: [],
  entities: {},
  quotes: [],
  gaps: [],
  confidence: 0.9,
};

beforeEach(() => {
  mockRun.mockReset();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("resolveDestination", () => {
  it("keeps a fully valid destination and preserves the board", () => {
    const dest = resolveDestination(
      { projectKey: "PLAT", issueType: "Task", board: "B1" },
      CONFIG,
    );
    expect(dest).toEqual({ projectKey: "PLAT", issueType: "Task", board: "B1" });
  });

  it("falls back to default project + first issue type for an unknown project", () => {
    const dest = resolveDestination({ projectKey: "NOPE", issueType: "Bug" }, CONFIG);
    expect(dest).toEqual({ projectKey: "WEB", issueType: "Bug" });
  });

  it("falls back when the issue type is not valid for the picked project", () => {
    const dest = resolveDestination({ projectKey: "PLAT", issueType: "Bug" }, CONFIG);
    expect(dest).toEqual({ projectKey: "WEB", issueType: "Bug" });
  });

  it("drops the board when it has to fall back", () => {
    const dest = resolveDestination(
      { projectKey: "NOPE", issueType: "Bug", board: "B1" },
      CONFIG,
    );
    expect(dest.board).toBeUndefined();
  });

  it("uses the first project when defaultProjectKey is missing from config", () => {
    const badDefault: RoutingConfig = { ...CONFIG, defaultProjectKey: "GONE" };
    const dest = resolveDestination({ projectKey: "NOPE", issueType: "x" }, badDefault);
    expect(dest).toEqual({ projectKey: "WEB", issueType: "Bug" });
  });
});

describe("buildSchema", () => {
  it("constrains destination enums to the configured keys and issue types", () => {
    // InputSchema is intentionally loose; cast to read the nested enums.
    const props = buildSchema(CONFIG).properties as any;
    expect(props.destination.properties.projectKey.enum).toEqual(["WEB", "PLAT"]);
    expect(props.destination.properties.issueType.enum).toEqual(["Bug", "Story", "Task"]);
  });
});

describe("triage", () => {
  it("re-validates the model's destination against the config", async () => {
    const modelOutput: TriageResult = {
      type: "bug",
      destination: { projectKey: "HALLUCINATED", issueType: "Bug" },
      priority: "high",
      labels: ["export"],
      confidence: 0.9,
      reasoning: "export fails with a 500",
    };
    mockRun.mockResolvedValue(modelOutput);

    const result = await triage(NORMALIZED, CONFIG);

    expect(result.destination).toEqual({ projectKey: "WEB", issueType: "Bug" });
    // Everything else from the model is passed through untouched.
    expect(result.type).toBe("bug");
    expect(result.priority).toBe("high");
    expect(result.labels).toEqual(["export"]);
  });
});
