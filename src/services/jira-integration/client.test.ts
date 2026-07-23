import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addAttachment, createIssue, JiraApiError } from './client';

const ENV = {
  JIRA_BASE_URL: 'https://example.atlassian.net',
  JIRA_EMAIL: 'bot@example.com',
  JIRA_API_TOKEN: 'fake-token',
  JIRA_PROJECT_KEY: 'PROJ',
};

beforeEach(() => {
  Object.entries(ENV).forEach(([key, value]) => vi.stubEnv(key, value));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('createIssue', () => {
  it('posts to the Jira issue endpoint with the expected payload and auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ key: 'PROJ-1' }) });
    vi.stubGlobal('fetch', fetchMock);

    const result = await createIssue({
      summary: 'Something broke',
      description: { type: 'doc', version: 1, content: [] },
      issueType: 'Bug',
    });

    expect(result).toEqual({ key: 'PROJ-1', url: 'https://example.atlassian.net/browse/PROJ-1' });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.atlassian.net/rest/api/3/issue');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(init.headers['Content-Type']).toBe('application/json');

    const body = JSON.parse(init.body);
    expect(body.fields.project).toEqual({ key: 'PROJ' });
    expect(body.fields.summary).toBe('Something broke');
    expect(body.fields.issuetype).toEqual({ name: 'Bug' });
  });

  it('throws JiraApiError with status and body text on a non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'Bad request: missing field' })
    );

    const call = createIssue({
      summary: 'x',
      description: { type: 'doc', version: 1, content: [] },
      issueType: 'Bug',
    });

    await expect(call).rejects.toThrow(JiraApiError);
    await expect(call.catch((e) => e)).resolves.toMatchObject({ status: 400 });
  });
});

describe('addAttachment', () => {
  it('posts multipart form data to the attachment endpoint with the no-check header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    await addAttachment('PROJ-1', {
      filename: 'screenshot.png',
      contentType: 'image/png',
      data: Buffer.from('hello').toString('base64'),
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://example.atlassian.net/rest/api/3/issue/PROJ-1/attachments');
    expect(init.method).toBe('POST');
    expect(init.headers['X-Atlassian-Token']).toBe('no-check');
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(init.body).toBeInstanceOf(FormData);
  });

  it('accepts raw Buffer data as well as base64 strings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));

    await expect(
      addAttachment('PROJ-1', {
        filename: 'a.bin',
        contentType: 'application/octet-stream',
        data: Buffer.from([1, 2, 3]),
      })
    ).resolves.toBeUndefined();
  });

  it('throws JiraApiError on a failed upload', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 413, text: async () => 'too large' }));

    await expect(
      addAttachment('PROJ-1', { filename: 'a.png', contentType: 'image/png', data: 'abc' })
    ).rejects.toThrow(JiraApiError);
  });
});
