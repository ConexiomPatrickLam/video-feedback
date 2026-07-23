import { NextRequest, NextResponse } from 'next/server';
import { prepareTicketFromVideo, type RoutingConfig } from '@/lib/ticket-pipeline';
import { toTicketInput } from '@/lib/ticket-pipeline/to-jira-input';
import { createJiraTicket } from '@/services/jira-integration';

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

  if (!(video instanceof Blob)) {
    return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  }

  try {
    // Gemini reads the recording (video + audio) → NormalizedInput; Claude triages
    // it, then Claude composes the actual ticket content from evidence + triage.
    const { normalized, triage, content, needsReview } = await prepareTicketFromVideo(
      { video, text: typeof description === 'string' ? description : undefined },
      ROUTING,
    );

    // File the real Jira ticket. Low-confidence results are still auto-filed for
    // now (no review queue exists yet) — `needsReview` is passed through so the
    // UI can flag it.
    const { issueKey, issueUrl } = await createJiraTicket(toTicketInput(content, triage));

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
