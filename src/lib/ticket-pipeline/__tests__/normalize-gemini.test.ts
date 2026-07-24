import { describe, expect, it } from "vitest";
import { isGeminiQuotaError } from "../agents/normalize-gemini";

describe("isGeminiQuotaError", () => {
  it("matches a 429 quota error (numeric status)", () => {
    expect(isGeminiQuotaError({ status: 429 })).toBe(true);
  });

  it("matches a RESOURCE_EXHAUSTED message", () => {
    expect(isGeminiQuotaError({ message: '{"error":{"code":429,"status":"RESOURCE_EXHAUSTED"}}' })).toBe(true);
  });

  it("matches a transient 500 INTERNAL error", () => {
    expect(
      isGeminiQuotaError({
        status: 500,
        message: '{"error":{"code":500,"message":"Internal error encountered.","status":"INTERNAL"}}',
      }),
    ).toBe(true);
  });

  it("matches a transient 503 UNAVAILABLE error", () => {
    expect(isGeminiQuotaError({ status: 503, message: '{"error":{"code":503,"status":"UNAVAILABLE"}}' })).toBe(true);
  });

  it("does not match a genuine 400 request error", () => {
    expect(isGeminiQuotaError({ status: 400, message: '{"error":{"code":400,"status":"INVALID_ARGUMENT"}}' })).toBe(
      false,
    );
  });

  it("does not match undefined/unrelated errors", () => {
    expect(isGeminiQuotaError(undefined)).toBe(false);
    expect(isGeminiQuotaError(new Error("network down"))).toBe(false);
  });
});
