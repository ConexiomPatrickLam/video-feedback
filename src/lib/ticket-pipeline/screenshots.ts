import { put } from '@vercel/blob';
import type { StepScreenshot } from '@/services/jira-integration';
import type { NormalizedInput, StepScreenshotRef } from './types';

export interface CapturedFrame {
  timestampMs: number;
  dataUrl: string;
}

/**
 * Compose citing stepScreenshots is best-effort — it may see real frame
 * evidence and still not cite it. When that happens, fall back to attaching
 * whatever frame evidence Gemini *did* report to the first step, so a ticket
 * doesn't ship with zero visual evidence whenever frame evidence exists.
 */
export function fallbackStepScreenshotRefs(normalized: NormalizedInput): StepScreenshotRef[] | undefined {
  const frameObservation = normalized.observations.find(
    (o) => o.source === 'frame' && o.frameTimestampMs !== undefined,
  );
  if (!frameObservation || frameObservation.frameTimestampMs === undefined) return undefined;
  return [{ stepIndex: 0, frameTimestampMs: frameObservation.frameTimestampMs }];
}

function closestFrame(targetMs: number, frames: CapturedFrame[]): CapturedFrame | undefined {
  return frames.reduce<CapturedFrame | undefined>((best, frame) => {
    if (!best) return frame;
    return Math.abs(frame.timestampMs - targetMs) < Math.abs(best.timestampMs - targetMs) ? frame : best;
  }, undefined);
}

/**
 * Match compose's step -> frameTimestampMs citations to the closest
 * client-captured frame, upload each matched frame to Vercel Blob, and return
 * (stepIndex, url) pairs ready to embed inline in the Jira description.
 */
export async function resolveStepScreenshots(
  refs: StepScreenshotRef[] | undefined,
  frames: CapturedFrame[],
): Promise<StepScreenshot[]> {
  if (!refs?.length || frames.length === 0) return [];

  const resolved = await Promise.all(
    refs.map(async (ref): Promise<StepScreenshot | undefined> => {
      const frame = closestFrame(ref.frameTimestampMs, frames);
      if (!frame) return undefined;

      const base64 = frame.dataUrl.split(',')[1];
      const blob = await put(`ticket-screenshots/step-${ref.stepIndex}-${Date.now()}.jpg`, Buffer.from(base64, 'base64'), {
        access: 'public',
        contentType: 'image/jpeg',
      });

      return { stepIndex: ref.stepIndex, url: blob.url };
    }),
  );

  return resolved.filter((r): r is StepScreenshot => r !== undefined);
}
