import { NextRequest, NextResponse } from 'next/server';
import {
  prepareTicketFromVideo,
  triage,
  CONFIDENCE_THRESHOLD,
  type RoutingConfig,
  type NormalizedInput,
} from '@/lib/ticket-pipeline';
import { createJiraTicket, type TicketInput } from '@/services/jira-integration';

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
 * which gets normalized + triaged, then filed in Jira with placeholder ticket
 * content (real ticket-body drafting is the content-generation agent's job,
 * not built yet).
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
    const { normalized, triage: triageResult, needsReview } = hasVideo
      ? await prepareTicketFromVideo({ video: video as Blob, text }, ROUTING)
      : await triageTextOnly(text!, ROUTING);

    const attachments = hasVideo
      ? [
          {
            filename: `recording.${extensionFor((video as Blob).type)}`,
            contentType: (video as Blob).type || 'video/webm',
            data: Buffer.from(await (video as Blob).arrayBuffer()),
          },
        ]
      : undefined;

    const ticketInput: TicketInput =
      triageResult.type === 'bug'
        ? {
            type: 'Bug',
            summary: normalized.summary,
            stepsToReproduce: [],
            expectedBehavior: '',
            actualBehavior: text ?? 'See attached recording.',
            attachments,
          }
        : {
            type: 'Feature',
            summary: normalized.summary,
            businessJustification: text ?? 'See attached recording.',
            acceptanceCriteria: [],
            attachments,
          };

    const { issueKey, issueUrl, attachmentResults } = await createJiraTicket(ticketInput);

    return NextResponse.json({ issueKey, issueUrl, attachmentResults, needsReview, triage: triageResult });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

function extensionFor(mimeType: string): string {
  return mimeType.split(';')[0].split('/')[1] || 'webm';
}

/** No video to analyze — skip Gemini and hand the raw text straight to triage. */
async function triageTextOnly(text: string, routing: RoutingConfig) {
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
  const needsReview =
    normalized.confidence < CONFIDENCE_THRESHOLD || triageResult.confidence < CONFIDENCE_THRESHOLD;

  return { normalized, triage: triageResult, needsReview };
}
