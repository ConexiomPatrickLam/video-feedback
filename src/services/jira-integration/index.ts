import { addAttachment, createIssue } from './client';
import { buildBugDescription, buildFeatureDescription } from './descriptionBuilders';
import { JiraTicketResult, TicketInput } from './types';

export type {
  BugTicketInput,
  FeatureTicketInput,
  TicketAttachment,
  TicketLink,
  EmbeddedImage,
  StepScreenshot,
  TicketInput,
  JiraTicketResult,
} from './types';
export { JiraApiError } from './client';

function issueTypeFor(input: TicketInput): string {
  return input.type === 'Bug'
    ? process.env.JIRA_ISSUE_TYPE_BUG ?? 'Bug'
    : process.env.JIRA_ISSUE_TYPE_FEATURE ?? 'Story';
}

/**
 * Single entry point for the Orchestrator: takes an already-classified,
 * already-drafted ticket and files it in Jira, attaching any files/screenshots.
 * Issue creation failures reject; individual attachment failures are captured
 * per-file in the result instead of failing an otherwise-valid ticket.
 */
export async function createJiraTicket(input: TicketInput): Promise<JiraTicketResult> {
  const description = input.type === 'Bug' ? buildBugDescription(input) : buildFeatureDescription(input);
  const issueType = issueTypeFor(input);

  const { key, url } = await createIssue({ summary: input.summary, description, issueType });

  const attachmentResults = await Promise.all(
    (input.attachments ?? []).map(async (attachment) => {
      try {
        await addAttachment(key, attachment);
        return { filename: attachment.filename, ok: true };
      } catch (err) {
        return { filename: attachment.filename, ok: false, error: (err as Error).message };
      }
    })
  );

  return { issueKey: key, issueUrl: url, attachmentResults };
}
