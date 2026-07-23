import { NextRequest, NextResponse } from 'next/server';

// TODO: replace this mock with a real call to Claude (parse the video/frames)
// and the Jira REST API (file the ticket) once ANTHROPIC_API_KEY and Jira
// credentials are wired up. See src/app/api/create-ticket/route.ts for a
// draft of that real implementation.
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const video = formData.get('video');

  if (!(video instanceof Blob)) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  }

  console.log(`Received recording: ${video.size} bytes, type ${video.type}`);

  // simulate AI processing time so the demo UI has something to show
  await new Promise((resolve) => setTimeout(resolve, 1500));

  return NextResponse.json({
    issueKey: 'MOCK-123',
    issueUrl: 'https://example.atlassian.net/browse/MOCK-123',
    summary: '[Mock] Issue detected in portal recording',
    description: `This is a placeholder ticket. Received a ${Math.round(video.size / 1024)}KB recording; real AI parsing + Jira creation not wired up yet.`,
  });
}
