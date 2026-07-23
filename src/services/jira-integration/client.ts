import { ADFDocument, TicketAttachment } from './types';

export class JiraApiError extends Error {
  constructor(public status: number, body: string) {
    super(`Jira API error: ${status} ${body}`);
    this.name = 'JiraApiError';
  }
}

function authHeader(): string {
  const auth = Buffer.from(`${process.env.JIRA_EMAIL}:${process.env.JIRA_API_TOKEN}`).toString('base64');
  return `Basic ${auth}`;
}

function baseUrl(): string {
  return process.env.JIRA_BASE_URL!;
}

export async function createIssue(fields: {
  summary: string;
  description: ADFDocument;
  issueType: string;
}): Promise<{ key: string; url: string }> {
  const res = await fetch(`${baseUrl()}/rest/api/3/issue`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: {
        project: { key: process.env.JIRA_PROJECT_KEY },
        summary: fields.summary,
        issuetype: { name: fields.issueType },
        description: fields.description,
      },
    }),
  });

  if (!res.ok) {
    throw new JiraApiError(res.status, await res.text());
  }

  const data = await res.json();
  return { key: data.key, url: `${baseUrl()}/browse/${data.key}` };
}

export async function addAttachment(issueKey: string, attachment: TicketAttachment): Promise<void> {
  const bytes = Buffer.isBuffer(attachment.data) ? attachment.data : Buffer.from(attachment.data, 'base64');
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(bytes)], { type: attachment.contentType }), attachment.filename);

  const res = await fetch(`${baseUrl()}/rest/api/3/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {
      Authorization: authHeader(),
      'X-Atlassian-Token': 'no-check',
    },
    body: form,
  });

  if (!res.ok) {
    throw new JiraApiError(res.status, await res.text());
  }
}
