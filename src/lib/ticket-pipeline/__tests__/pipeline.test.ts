import { describe, it, expect, vi, beforeEach } from "vitest";
import { normalizeVideo } from "../agents/normalize-gemini";
import { normalizeTextOnly } from "../agents/normalize-text";
import { triage } from "../agents/triage";
import { compose } from "../agents/compose";
import { prepareTicketFromVideo } from "../pipeline";
import type { BugContent, NormalizedInput, RoutingConfig, TriageResult } from "../types";

vi.mock("../agents/normalize-gemini", () => ({
  normalizeVideo: vi.fn(),
  isGeminiQuotaError: (err: { status?: number }) => err?.status === 429,
}));
vi.mock("../agents/normalize-text", () => ({ normalizeTextOnly: vi.fn() }));
vi.mock("../agents/triage", () => ({ triage: vi.fn() }));
vi.mock("../agents/compose", () => ({ compose: vi.fn() }));
const mockNormalizeVideo = vi.mocked(normalizeVideo);
const mockNormalizeText = vi.mocked(normalizeTextOnly);
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
  mockNormalizeText.mockReset();
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

describe("prepareTicketFromVideo — Gemini quota fallback", () => {
  it("falls back to Claude text-only normalize on a Gemini 429", async () => {
    mockNormalizeVideo.mockRejectedValue({ status: 429 });
    mockNormalizeText.mockResolvedValue(normalized(0.5));
    mockTriage.mockResolvedValue(triageResult(0.9));
    const input = videoInput();

    const result = await prepareTicketFromVideo(input, ROUTING);

    expect(mockNormalizeText).toHaveBeenCalledWith(expect.objectContaining({ text: input.text }));
    expect(mockTriage).toHaveBeenCalledOnce();
    expect(result.needsReview).toBe(true); // text-only confidence 0.5 < 0.6
  });

  it("rethrows non-quota Gemini errors without falling back", async () => {
    mockNormalizeVideo.mockRejectedValue({ status: 500 });

    await expect(prepareTicketFromVideo(videoInput(), ROUTING)).rejects.toBeDefined();
    expect(mockNormalizeText).not.toHaveBeenCalled();
  });

  it("throws instead of filing a junk ticket when quota is hit and there is no note", async () => {
    mockNormalizeVideo.mockRejectedValue({ status: 429 });

    await expect(
      prepareTicketFromVideo({ video: new Blob(["x"], { type: "video/webm" }) }, ROUTING),
    ).rejects.toThrow(/no typed note/i);
    expect(mockNormalizeText).not.toHaveBeenCalled();
  });
});
