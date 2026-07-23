import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as client from './client';
import { createJiraTicket } from './index';
import { BugTicketInput, FeatureTicketInput } from './types';

vi.mock('./client', () => ({
  createIssue: vi.fn(),
  addAttachment: vi.fn(),
}));

const mockedCreateIssue = vi.mocked(client.createIssue);
const mockedAddAttachment = vi.mocked(client.addAttachment);

beforeEach(() => {
  mockedCreateIssue.mockReset();
  mockedAddAttachment.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const bug: BugTicketInput = {
  type: 'Bug',
  summary: 'Crash on save',
  stepsToReproduce: ['Open doc', 'Click save'],
  expectedBehavior: 'Doc saves',
  actualBehavior: 'App crashes',
};

const feature: FeatureTicketInput = {
  type: 'Feature',
  summary: 'Add export to PDF',
  businessJustification: 'Customers ask for it weekly',
  acceptanceCriteria: ['Export button visible', 'Produces a valid PDF'],
};

describe('createJiraTicket', () => {
  it('creates a Bug issue with the default issue type and no attachments', async () => {
    mockedCreateIssue.mockResolvedValue({ key: 'PROJ-1', url: 'https://example.atlassian.net/browse/PROJ-1' });

    const result = await createJiraTicket(bug);

    expect(result).toEqual({
      issueKey: 'PROJ-1',
      issueUrl: 'https://example.atlassian.net/browse/PROJ-1',
      attachmentResults: [],
    });
    expect(mockedCreateIssue).toHaveBeenCalledWith(
      expect.objectContaining({ summary: bug.summary, issueType: 'Bug' })
    );
    expect(mockedAddAttachment).not.toHaveBeenCalled();
  });

  it('creates a Feature issue defaulting to the Story issue type', async () => {
    mockedCreateIssue.mockResolvedValue({ key: 'PROJ-2', url: 'https://example.atlassian.net/browse/PROJ-2' });

    await createJiraTicket(feature);

    expect(mockedCreateIssue).toHaveBeenCalledWith(expect.objectContaining({ issueType: 'Story' }));
  });

  it('respects JIRA_ISSUE_TYPE_BUG / JIRA_ISSUE_TYPE_FEATURE overrides', async () => {
    vi.stubEnv('JIRA_ISSUE_TYPE_BUG', 'Defect');
    vi.stubEnv('JIRA_ISSUE_TYPE_FEATURE', 'Feature Request');
    mockedCreateIssue.mockResolvedValue({ key: 'PROJ-3', url: 'https://example.atlassian.net/browse/PROJ-3' });

    await createJiraTicket(bug);
    expect(mockedCreateIssue).toHaveBeenLastCalledWith(expect.objectContaining({ issueType: 'Defect' }));

    await createJiraTicket(feature);
    expect(mockedCreateIssue).toHaveBeenLastCalledWith(expect.objectContaining({ issueType: 'Feature Request' }));
  });

  it('uploads all attachments and reports success for each', async () => {
    mockedCreateIssue.mockResolvedValue({ key: 'PROJ-4', url: 'https://example.atlassian.net/browse/PROJ-4' });
    mockedAddAttachment.mockResolvedValue(undefined);

    const result = await createJiraTicket({
      ...bug,
      attachments: [
        { filename: 'a.png', contentType: 'image/png', data: 'aaa' },
        { filename: 'b.png', contentType: 'image/png', data: 'bbb' },
      ],
    });

    expect(mockedAddAttachment).toHaveBeenCalledTimes(2);
    expect(result.attachmentResults).toEqual([
      { filename: 'a.png', ok: true },
      { filename: 'b.png', ok: true },
    ]);
  });

  it('captures a failed attachment upload without failing the whole ticket', async () => {
    mockedCreateIssue.mockResolvedValue({ key: 'PROJ-5', url: 'https://example.atlassian.net/browse/PROJ-5' });
    mockedAddAttachment.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('too large'));

    const result = await createJiraTicket({
      ...bug,
      attachments: [
        { filename: 'ok.png', contentType: 'image/png', data: 'aaa' },
        { filename: 'bad.png', contentType: 'image/png', data: 'bbb' },
      ],
    });

    expect(result.issueKey).toBe('PROJ-5');
    expect(result.attachmentResults).toEqual([
      { filename: 'ok.png', ok: true },
      { filename: 'bad.png', ok: false, error: 'too large' },
    ]);
  });

  it('rejects the whole call when issue creation itself fails, and never attempts attachments', async () => {
    mockedCreateIssue.mockRejectedValue(new Error('Jira API error: 400 bad request'));

    await expect(
      createJiraTicket({ ...bug, attachments: [{ filename: 'a.png', contentType: 'image/png', data: 'aaa' }] })
    ).rejects.toThrow('Jira API error: 400 bad request');
    expect(mockedAddAttachment).not.toHaveBeenCalled();
  });
});
