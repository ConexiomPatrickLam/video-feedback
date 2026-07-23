import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeVideo } from "../agents/normalize-gemini";
import { triage } from "../agents/triage";
import { compose } from "../agents/compose";
import { prepareTicketFromVideo } from "../pipeline";
import type { BugContent, NormalizedInput, RoutingConfig, TriageResult } from "../types";

vi.mock("../agents/normalize-gemini", () => ({ normalizeVideo: vi.fn() }));
vi.mock("../agents/triage", () => ({ triage: vi.fn() }));
vi.mock("../agents/compose", () => ({ compose: vi.fn() }));
const mockNormalizeVideo = vi.mocked(normalizeVideo);
const mockTriage = vi.mocked(triage);
const mockCompose = vi.mocked(compose);

const ROUTING: RoutingConfig = {
  projects: [{ key: "WEB", name: "Web", description: "web", issueTypes: ["Bug"] }],
  defaultProjectKey: "WEB",
};

function normalized(confidence: number): NormalizedInput {
  return { summary: "s", intent: "i", observations: [], entities: {}, quotes: [], gaps: [], confidence };
}

function triageResult(confidence: number): TriageResult {
  return {
    type: "bug",
    destination: { projectKey: "WEB", issueType: "Bug" },
    priority: "medium",
    labels: [],
    confidence,
    reasoning: "r",
  };
}

function composedContent(): BugContent {
  return {
    summary: "s",
    stepsToReproduce: ["step 1"],
    expectedBehavior: "expected",
    actualBehavior: "actual",
  };
}

function videoInput() {
  return { video: new Blob(["fake-webm"], { type: "video/webm" }), text: "note" };
}

beforeEach(() => {
  mockNormalizeVideo.mockReset();
  mockTriage.mockReset();
  mockCompose.mockReset();
  mockCompose.mockResolvedValue(composedContent());
});

describe("prepareTicketFromVideo", () => {
  it("runs Gemini normalize, then Claude triage, then Claude compose", async () => {
    mockNormalizeVideo.mockResolvedValue(normalized(0.9));
    mockTriage.mockResolvedValue(triageResult(0.8));
    const input = videoInput();

    const result = await prepareTicketFromVideo(input, ROUTING);

    expect(mockNormalizeVideo).toHaveBeenCalledWith(input);
    expect(mockTriage).toHaveBeenCalledOnce();
    expect(mockCompose).toHaveBeenCalledOnce();
    expect(result.content).toEqual(composedContent());
  });

  it("needsReview is false when both confidences are at/above the threshold", async () => {
    mockNormalizeVideo.mockResolvedValue(normalized(0.8));
    mockTriage.mockResolvedValue(triageResult(0.7));
    const result = await prepareTicketFromVideo(videoInput(), ROUTING);
    expect(result.needsReview).toBe(false);
  });

  it("needsReview is true when normalize confidence is below the threshold", async () => {
    mockNormalizeVideo.mockResolvedValue(normalized(0.4));
    mockTriage.mockResolvedValue(triageResult(0.9));
    const result = await prepareTicketFromVideo(videoInput(), ROUTING);
    expect(result.needsReview).toBe(true);
  });

  it("needsReview is true when triage confidence is below the threshold", async () => {
    mockNormalizeVideo.mockResolvedValue(normalized(0.9));
    mockTriage.mockResolvedValue(triageResult(0.3));
    const result = await prepareTicketFromVideo(videoInput(), ROUTING);
    expect(result.needsReview).toBe(true);
  });
});
