import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { description, frames } = await req.json();

    if (!description && (!frames || frames.length === 0)) {
      return NextResponse.json({ error: 'No description or frames provided' }, { status: 400 });
    }

    const ticket = await draftTicketWithClaude(description, frames ?? []);
    const { issueKey, issueUrl } = await createJiraIssue(ticket);

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

async function createJiraIssue(ticket: { summary: string; description: string; issueType: string }) {
  const baseUrl = process.env.JIRA_BASE_URL!;
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');

  const res = await fetch(`${baseUrl}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY },
        summary: ticket.summary,
        issuetype: { name: ticket.issueType || 'Bug' },
        description: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'text', text: ticket.description }],
            },
          ],
        },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Jira API error: ${res.status} ${body}`);
  }

  const data = await res.json();
  return { issueKey: data.key, issueUrl: `${baseUrl}/browse/${data.key}` };
}
