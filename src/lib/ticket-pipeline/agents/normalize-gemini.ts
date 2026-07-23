import {
  GoogleGenAI,
  Type,
  createPartFromBase64,
  createPartFromUri,
  createUserContent,
  FileState,
  type Part,
  type Schema,
} from "@google/genai";
import type { CaptureMetadata, NormalizedInput } from "../types";

/**
 * Gemini model for the normalize step. Swap to your current Gemini model — it
 * must support video input + structured output. (Separate from the Claude MODEL
 * used by triage.)
 */
export const GEMINI_MODEL = "gemini-flash-latest";

// Inline base64 keeps the video in-request (nothing stored on Google's side).
// Above this, we fall back to the File API (uploads, then deletes after use).
const INLINE_LIMIT_BYTES = 18 * 1024 * 1024;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const INSTRUCTIONS = `You are the NORMALIZE agent — a ticket-type-neutral evidence layer.

You are watching a screen recording (video, possibly with audio). Answer only
"what is TRUE here?". You do NOT decide the ticket type (bug/feature), write any
ticket title/description, or use bug-specific framing like "steps to reproduce".
Include something only if it would be true regardless of the eventual ticket type.

Attribute every observation to its source:
- what you SEE in the video → source "frame"; set frameTimestampMs to the time in
  the recording (milliseconds) where it appears
- what is SPOKEN in the audio → source "transcript"
- the user's typed note (below) → source "text"

Never invent errors, actions, URLs, or environment details that aren't in the
recording, audio, or typed note. Record verbatim standout phrases as quotes and
note anything missing or unclear as gaps.`;

const SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    summary: { type: Type.STRING },
    intent: { type: Type.STRING },
    observations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          statement: { type: Type.STRING },
          source: { type: Type.STRING, enum: ["text", "transcript", "frame"] },
          frameTimestampMs: { type: Type.NUMBER },
        },
        required: ["statement", "source"],
      },
    },
    entities: {
      type: Type.OBJECT,
      properties: {
        components: { type: Type.ARRAY, items: { type: Type.STRING } },
        errorMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
        urls: { type: Type.ARRAY, items: { type: Type.STRING } },
        userActions: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
    },
    environment: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING },
        browser: { type: Type.STRING },
        os: { type: Type.STRING },
        appVersion: { type: Type.STRING },
      },
    },
    quotes: { type: Type.ARRAY, items: { type: Type.STRING } },
    gaps: { type: Type.ARRAY, items: { type: Type.STRING } },
    confidence: { type: Type.NUMBER },
  },
  required: ["summary", "intent", "observations", "entities", "quotes", "gaps", "confidence"],
};

export interface NormalizeVideoInput {
  video: Blob;
  /** Defaults to "video/webm" (what the feedback widget records). */
  mimeType?: string;
  /** The user's typed note, if any. */
  text?: string;
  metadata?: CaptureMetadata;
}

/**
 * Agent 1 (Gemini variant) — feed the raw recording to Gemini, which reads the
 * video AND audio natively, and get back the same NormalizedInput the Claude
 * triage step expects. No frame extraction / transcription needed upstream.
 */
export async function normalizeVideo(input: NormalizeVideoInput): Promise<NormalizedInput> {
  const mimeType = input.mimeType ?? "video/webm";

  const promptParts: string[] = [INSTRUCTIONS];
  if (input.text) promptParts.push(`User's typed note:\n${input.text}`);
  if (input.metadata) promptParts.push(`Capture metadata:\n${JSON.stringify(input.metadata, null, 2)}`);
  const prompt = promptParts.join("\n\n");

  let videoPart: Part;
  let uploadedFileName: string | undefined;

  if (input.video.size <= INLINE_LIMIT_BYTES) {
    const base64 = Buffer.from(await input.video.arrayBuffer()).toString("base64");
    videoPart = createPartFromBase64(base64, mimeType);
  } else {
    const uploaded = await ai.files.upload({ file: input.video, config: { mimeType } });
    uploadedFileName = uploaded.name;
    let file = uploaded;
    while (file.state === FileState.PROCESSING) {
      await new Promise((r) => setTimeout(r, 2000));
      file = await ai.files.get({ name: uploaded.name! });
    }
    if (file.state === FileState.FAILED) throw new Error("Gemini file processing failed.");
    videoPart = createPartFromUri(file.uri!, file.mimeType!);
  }

  try {
    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: createUserContent([{ text: prompt }, videoPart]),
      config: { responseMimeType: "application/json", responseSchema: SCHEMA },
    });

    if (!response.text) throw new Error("Gemini returned no structured output.");
    return JSON.parse(response.text) as NormalizedInput;
  } finally {
    // Don't leave the recording sitting on Google's servers.
    if (uploadedFileName) await ai.files.delete({ name: uploadedFileName }).catch(() => {});
  }
}
