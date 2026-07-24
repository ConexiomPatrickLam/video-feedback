import { NextRequest, NextResponse } from 'next/server';
import { prepareTicketFromVideo, type BugContent, type RoutingConfig } from '@/lib/ticket-pipeline';
import { toTicketInput } from '@/lib/ticket-pipeline/to-jira-input';
import {
  fallbackStepScreenshotRefs,
  resolveStepScreenshots,
  type CapturedFrame,
} from '@/lib/ticket-pipeline/screenshots';
import { createJiraTicket, type TicketAttachment } from '@/services/jira-integration';

// Pipeline runs the Anthropic + Google SDKs — needs the Node runtime, and video
// analysis can take a while, so give the route room on Vercel.
export const runtime = 'nodejs';
export const maxDuration = 60;

const PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? 'FEEDBACK';

// What triage is allowed to route to. Swap for the real Jira project(s)/issue
// types once they're known.
const ROUTING: RoutingConfig = {
  projects: [
    {
      key: PROJECT_KEY,
      name: 'Feedback',
      description: 'User-reported feedback captured via the screen-recording widget.',
      issueTypes: ['Bug', 'Task'],
    },
  ],
  defaultProjectKey: PROJECT_KEY,
};

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const video = formData.get('video');
  const description = formData.get('description'); // optional typed note
  const framesField = formData.get('frames'); // optional JSON array of captured screenshots

  if (!(video instanceof Blob)) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  }

  let frames: CapturedFrame[] = [];
  if (typeof framesField === 'string') {
    try {
      frames = JSON.parse(framesField);
    } catch {
      frames = [];
    }
  }

  try {
    // Gemini reads the recording (video + audio) → NormalizedInput; Claude triages
    // it, then Claude composes the actual ticket content from evidence + triage.
    const { normalized, triage, content, needsReview } = await prepareTicketFromVideo(
      { video, text: typeof description === 'string' ? description : undefined },
      ROUTING,
    );

    // Match compose's cited step->frame timestamps to the closest captured
    // screenshot and upload it, so it can be embedded under that step. Compose
    // citing evidence is best-effort — if it cited nothing but Gemini did
    // report real frame evidence, still attach one rather than shipping a
    // ticket with zero visual evidence.
    let stepScreenshots: Awaited<ReturnType<typeof resolveStepScreenshots>> = [];
    if (triage.type === 'bug') {
      stepScreenshots = await resolveStepScreenshots((content as BugContent).stepScreenshots, frames);
      if (stepScreenshots.length === 0) {
        stepScreenshots = await resolveStepScreenshots(fallbackStepScreenshotRefs(normalized), frames);
      }
      console.log(
        `[ticket-pipeline] stepScreenshots: cited=${(content as BugContent).stepScreenshots?.length ?? 0} ` +
          `resolved=${stepScreenshots.length} capturedFrames=${frames.length}`,
      );
    }

    // File the real Jira ticket. Low-confidence results are still auto-filed for
    // now (no review queue exists yet) — `needsReview` is passed through so the
    // UI can flag it.
    // Attach the full recording so reviewers can watch it (separate from the
    // inline step screenshots). Attachment failures are captured per-file and
    // don't fail an otherwise-valid ticket.
    const attachments: TicketAttachment[] = [
      {
        filename: `recording.${extensionFor(video.type)}`,
        contentType: video.type || 'video/webm',
        data: Buffer.from(await video.arrayBuffer()),
      },
    ];
    const { issueKey, issueUrl, attachmentResults } = await createJiraTicket({
      ...toTicketInput(content, triage, stepScreenshots),
      attachments,
    });
    console.log(`[ticket-pipeline] jira:\n${JSON.stringify({ issueKey, issueUrl, attachmentResults }, null, 2)}`);

    return NextResponse.json({
      issueKey,
      issueUrl,
      summary: content.summary,
      type: triage.type,
      priority: triage.priority,
      labels: triage.labels,
      destination: triage.destination,
      reasoning: triage.reasoning,
      needsReview,
      normalized,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function extensionFor(mimeType: string): string {
  return mimeType.split(';')[0].split('/')[1] || 'webm';
}
