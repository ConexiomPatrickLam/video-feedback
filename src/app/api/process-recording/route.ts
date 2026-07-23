import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, createPartFromUri, FileState } from '@google/genai';

// Video processing + polling can take a while; give the route room on Vercel.
export const maxDuration = 60;

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// TODO: Jira ticket creation is still mocked below — see
// src/app/api/create-ticket/route.ts for a draft REST-API implementation
// once Jira credentials are configured.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const video = formData.get('video');

  if (!(video instanceof Blob)) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  }

  try {
    let file = await ai.files.upload({
      file: video,
      config: { mimeType: 'video/webm' },
    });

    for (let attempts = 0; file.state === FileState.PROCESSING && attempts < 20; attempts++) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      file = await ai.files.get({ name: file.name! });
    }

    if (file.state !== FileState.ACTIVE) {
      throw new Error(`Video processing did not complete (state: ${file.state})`);
    }

    const response = await ai.models.generateContent({
      model: 'gemini-flash-latest',
      contents: [
        createPartFromUri(file.uri!, file.mimeType!),
        'A user recorded a screen capture of our web portal while reporting feedback or a bug. ' +
          'Watch the video and draft a Jira ticket describing what happened. ' +
          'Respond with ONLY a JSON object, no markdown fences, in this exact shape:\n' +
          '{"summary": "short title", "description": "detailed description including steps to reproduce inferred from the video", "issueType": "Bug" or "Task"}',
      ],
    });

    const ticket = JSON.parse(response.text ?? '{}');

    return NextResponse.json({
      issueKey: 'MOCK-123',
      issueUrl: 'https://example.atlassian.net/browse/MOCK-123',
      summary: ticket.summary,
      description: ticket.description,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
