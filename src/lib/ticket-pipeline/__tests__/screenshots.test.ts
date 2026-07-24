import { describe, expect, it, vi, beforeEach } from 'vitest';
import { put } from '@vercel/blob';
import { fallbackStepScreenshotRefs, resolveStepScreenshots, type CapturedFrame } from '../screenshots';
import type { NormalizedInput } from '../types';

vi.mock('@vercel/blob', () => ({ put: vi.fn() }));
const mockPut = vi.mocked(put);

const FRAMES: CapturedFrame[] = [
  { timestampMs: 1000, dataUrl: 'data:image/jpeg;base64,AAA' },
  { timestampMs: 5000, dataUrl: 'data:image/jpeg;base64,BBB' },
  { timestampMs: 9000, dataUrl: 'data:image/jpeg;base64,CCC' },
];

beforeEach(() => {
  mockPut.mockReset();
  mockPut.mockImplementation(async (pathname) => ({
    url: `https://blob.example.com/${pathname}`,
    downloadUrl: '',
    pathname: String(pathname),
    contentType: 'image/jpeg',
    contentDisposition: '',
    etag: 'mock-etag',
  }));
});

describe('resolveStepScreenshots', () => {
  it('returns nothing when there are no refs or no captured frames', async () => {
    expect(await resolveStepScreenshots(undefined, FRAMES)).toEqual([]);
    expect(await resolveStepScreenshots([{ stepIndex: 0, frameTimestampMs: 1000 }], [])).toEqual([]);
  });

  it('matches each ref to the closest captured frame and uploads it', async () => {
    const result = await resolveStepScreenshots(
      [
        { stepIndex: 0, frameTimestampMs: 1200 }, // closest to 1000
        { stepIndex: 2, frameTimestampMs: 8800 }, // closest to 9000
      ],
      FRAMES,
    );

    expect(result).toEqual([
      { stepIndex: 0, url: expect.stringContaining('step-0') },
      { stepIndex: 2, url: expect.stringContaining('step-2') },
    ]);
    expect(mockPut).toHaveBeenCalledTimes(2);

    // uploaded bytes are the base64-decoded frame data, not the raw data URL
    const [, body, options] = mockPut.mock.calls[0];
    expect(Buffer.isBuffer(body)).toBe(true);
    expect(options).toMatchObject({ access: 'public', contentType: 'image/jpeg' });
  });
});

function normalizedWith(observations: NormalizedInput['observations']): NormalizedInput {
  return { summary: 's', intent: 'i', observations, entities: {}, quotes: [], gaps: [], confidence: 0.9 };
}

describe('fallbackStepScreenshotRefs', () => {
  it('cites the first frame observation to step 0 when compose cited nothing', () => {
    const normalized = normalizedWith([
      { statement: 'user typed a note', source: 'text' },
      { statement: 'error banner visible', source: 'frame', frameTimestampMs: 4200 },
      { statement: 'second error banner', source: 'frame', frameTimestampMs: 7000 },
    ]);

    expect(fallbackStepScreenshotRefs(normalized)).toEqual([{ stepIndex: 0, frameTimestampMs: 4200 }]);
  });

  it('returns undefined when there are no frame observations at all', () => {
    const normalized = normalizedWith([
      { statement: 'typed note', source: 'text' },
      { statement: 'spoken narration', source: 'transcript' },
    ]);

    expect(fallbackStepScreenshotRefs(normalized)).toBeUndefined();
  });

  it('returns undefined when there are no observations at all (e.g. text-only fallback)', () => {
    expect(fallbackStepScreenshotRefs(normalizedWith([]))).toBeUndefined();
  });
});
