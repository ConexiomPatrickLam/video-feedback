import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createJiraTicket, BugTicketInput } from '@/services/jira-integration';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { description, frames } = await req.json();

    if (!description && (!frames || frames.length === 0)) {
      return NextResponse.json({ error: 'No description or frames provided' }, { status: 400 });
    }

    const draft = await draftTicketWithClaude(description, frames ?? []);
    const bugInput: BugTicketInput = {
      type: 'Bug',
      summary: draft.summary,
      stepsToReproduce: [],
      expectedBehavior: 'N/A — inferred from a recorded session; see actual behavior below.',
      actualBehavior: draft.description,
      attachments: (frames ?? []).map((dataUrl: string, i: number) => ({
        filename: `frame-${i + 1}.jpg`,
        contentType: 'image/jpeg',
        data: dataUrl.split(',')[1], // strip "data:image/jpeg;base64,"
      })),
    };

    const { issueKey, issueUrl } = await createJiraTicket(bugInput);

    return NextResponse.json({ issueKey, issueUrl });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}

async function draftTicketWithClaude(description: string, frames: string[]) {
  const imageBlocks = frames.map((dataUrl: string) => ({
    type: 'image' as const,
    source: {
      type: 'base64' as const,
      media_type: 'image/jpeg' as const,
      data: dataUrl.split(',')[1], // strip "data:image/jpeg;base64,"
    },
  }));

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-5',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `A user recorded a sequence of screenshots from our web portal while reporting feedback/a bug. ` +
              `Their written note is: "${description}"\n\n` +
              `Based on the note and the screenshots (in chronological order), draft a Jira ticket. ` +
              `Respond with ONLY a JSON object, no markdown fences, in this exact shape:\n` +
              `{"summary": "short title", "description": "detailed description including steps to reproduce inferred from the screenshots", "issueType": "Bug" or "Task"}`,
          },
          ...imageBlocks,
        ],
      },
    ],
  });

  const text = message.content.find((b) => b.type === 'text')?.text ?? '{}';
  return JSON.parse(text);
}
