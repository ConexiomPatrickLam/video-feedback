import { NextRequest, NextResponse } from 'next/server';
import {
  prepareTicketFromVideo,
  triage,
  compose,
  CONFIDENCE_THRESHOLD,
  type RoutingConfig,
  type NormalizedInput,
} from '@/lib/ticket-pipeline';
import { toTicketInput } from '@/lib/ticket-pipeline/to-jira-input';
import { createJiraTicket, type TicketAttachment } from '@/services/jira-integration';

// Pipeline runs the Anthropic + Google SDKs — needs the Node runtime, and video
// analysis can take a while, so give the route room on Vercel.
export const runtime = 'nodejs';
export const maxDuration = 60;

const PROJECT_KEY = process.env.JIRA_PROJECT_KEY ?? 'FEEDBACK';

// What triage is allowed to route to. destination isn't used yet (see below) —
// only triage.type (bug/feature) drives the ticket shape for now.
const ROUTING: RoutingConfig = {
  projects: [
    {
      key: PROJECT_KEY,
      name: 'Feedback',
      description: 'User-reported feedback submitted via the external feedback API.',
      issueTypes: ['Bug', 'Feature'],
    },
  ],
  defaultProjectKey: PROJECT_KEY,
};

/**
 * External intake: a caller submits a screen recording and/or a text note,
 * which gets normalized, triaged, and composed into real ticket content, then
 * filed in Jira (with the recording attached, when one was submitted).
 */
export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const video = formData.get('video');
  const textField = formData.get('text');
  const rawText = typeof textField === 'string' ? textField.trim() : '';
  const text = rawText.length > 0 ? rawText : undefined;
  const hasVideo = video instanceof Blob && video.size > 0;

  if (!hasVideo && !text) {
    return NextResponse.json({ error: 'Provide a video, text, or both' }, { status: 400 });
  }

  try {
    const { triage: triageResult, content, needsReview } = hasVideo
      ? await prepareTicketFromVideo({ video: video as Blob, text }, ROUTING)
      : await triageAndComposeTextOnly(text!, ROUTING);

    const attachments: TicketAttachment[] | undefined = hasVideo
      ? [
          {
            filename: `recording.${extensionFor((video as Blob).type)}`,
            contentType: (video as Blob).type || 'video/webm',
            data: Buffer.from(await (video as Blob).arrayBuffer()),
          },
        ]
      : undefined;

    const ticketInput = { ...toTicketInput(content, triageResult), attachments };
    const { issueKey, issueUrl, attachmentResults } = await createJiraTicket(ticketInput);

    return NextResponse.json({
      issueKey,
      issueUrl,
      attachmentResults,
      needsReview,
      triage: triageResult,
      summary: content.summary,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function extensionFor(mimeType: string): string {
  return mimeType.split(';')[0].split('/')[1] || 'webm';
}

/** No video to analyze — skip Gemini, triage + compose directly off the raw text. */
async function triageAndComposeTextOnly(text: string, routing: RoutingConfig) {
  const normalized: NormalizedInput = {
    summary: text,
    intent: text,
    observations: [{ statement: text, source: 'text' }],
    entities: {},
    quotes: [],
    gaps: [],
    confidence: 1,
  };

  const triageResult = await triage(normalized, routing);
  const content = await compose(normalized, triageResult);
  const needsReview =
    normalized.confidence < CONFIDENCE_THRESHOLD || triageResult.confidence < CONFIDENCE_THRESHOLD;

  return { normalized, triage: triageResult, content, needsReview };
}
