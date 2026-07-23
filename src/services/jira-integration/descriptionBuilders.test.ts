import { describe, expect, it } from 'vitest';
import { buildBugDescription, buildFeatureDescription } from './descriptionBuilders';
import { ADFDocument, BugTicketInput, FeatureTicketInput } from './types';

function headingTexts(doc: ADFDocument): string[] {
  return doc.content
    .filter((n): n is Extract<typeof n, { type: 'heading' }> => n.type === 'heading')
    .map((n) => n.content[0].text);
}

function paragraphTexts(doc: ADFDocument): string[] {
  return doc.content
    .filter((n): n is Extract<typeof n, { type: 'paragraph' }> => n.type === 'paragraph')
    .map((n) => n.content[0].text);
}

function mediaSingleNodes(doc: ADFDocument) {
  return doc.content.filter((n): n is Extract<typeof n, { type: 'mediaSingle' }> => n.type === 'mediaSingle');
}

function linkListEntries(doc: ADFDocument) {
  const bulletLists = doc.content.filter((n): n is Extract<typeof n, { type: 'bulletList' }> => n.type === 'bulletList');
  return bulletLists
    .flatMap((list) => list.content)
    .flatMap((item) => item.content)
    .filter((n): n is Extract<typeof n, { type: 'paragraph' }> => n.type === 'paragraph')
    .flatMap((p) => p.content)
    .filter((inline) => (inline.marks?.length ?? 0) > 0);
}

describe('buildBugDescription', () => {
  const base: BugTicketInput = {
    type: 'Bug',
    summary: 'Login button does nothing',
    stepsToReproduce: ['Go to /login', 'Click Sign In'],
    expectedBehavior: 'User is redirected to the dashboard',
    actualBehavior: 'Nothing happens',
  };

  it('renders steps to reproduce as an ordered list when present', () => {
    const doc = buildBugDescription(base);

    expect(headingTexts(doc)).toContain('Steps to Reproduce');
    const list = doc.content.find((n) => n.type === 'orderedList');
    expect(list?.content).toHaveLength(2);
  });

  it('omits the steps heading and list when stepsToReproduce is empty', () => {
    const doc = buildBugDescription({ ...base, stepsToReproduce: [] });

    expect(headingTexts(doc)).not.toContain('Steps to Reproduce');
    expect(doc.content.some((n) => n.type === 'orderedList')).toBe(false);
  });

  it('always includes expected and actual behavior', () => {
    const doc = buildBugDescription(base);

    expect(headingTexts(doc)).toEqual(expect.arrayContaining(['Expected Behavior', 'Actual Behavior']));
    expect(paragraphTexts(doc)).toContain(base.expectedBehavior);
    expect(paragraphTexts(doc)).toContain(base.actualBehavior);
  });

  it('includes environment and severity only when provided', () => {
    const withExtras = buildBugDescription({ ...base, environment: 'Chrome 120 / macOS', severity: 'High' });
    expect(headingTexts(withExtras)).toEqual(expect.arrayContaining(['Environment', 'Severity']));

    const without = buildBugDescription(base);
    expect(headingTexts(without)).not.toContain('Environment');
    expect(headingTexts(without)).not.toContain('Severity');
  });

  it('mentions attachments only when present', () => {
    const withAttachment = buildBugDescription({
      ...base,
      attachments: [{ filename: 'a.png', contentType: 'image/png', data: 'abc' }],
    });
    expect(paragraphTexts(withAttachment).some((t) => t.includes('attached'))).toBe(true);

    const without = buildBugDescription(base);
    expect(paragraphTexts(without).some((t) => t.includes('attached'))).toBe(false);
  });

  it('embeds external images as mediaSingle nodes only when provided', () => {
    const withImage = buildBugDescription({
      ...base,
      embeddedImages: [{ url: 'https://example.com/screenshot.png', alt: 'Broken layout' }],
    });
    expect(headingTexts(withImage)).toContain('Screenshots');
    const media = mediaSingleNodes(withImage);
    expect(media).toHaveLength(1);
    expect(media[0].content[0]).toEqual({
      type: 'media',
      attrs: { type: 'external', url: 'https://example.com/screenshot.png', alt: 'Broken layout' },
    });

    const without = buildBugDescription(base);
    expect(headingTexts(without)).not.toContain('Screenshots');
    expect(mediaSingleNodes(without)).toHaveLength(0);
  });

  it('renders related links as a bullet list of hyperlinks only when provided', () => {
    const withLinks = buildBugDescription({
      ...base,
      links: [{ label: 'Related PR', url: 'https://example.com/pr/1' }],
    });
    expect(headingTexts(withLinks)).toContain('Related Links');
    const entries = linkListEntries(withLinks);
    expect(entries).toEqual([
      { type: 'text', text: 'Related PR', marks: [{ type: 'link', attrs: { href: 'https://example.com/pr/1' } }] },
    ]);

    const without = buildBugDescription(base);
    expect(headingTexts(without)).not.toContain('Related Links');
    expect(linkListEntries(without)).toHaveLength(0);
  });
});

describe('buildFeatureDescription', () => {
  const base: FeatureTicketInput = {
    type: 'Feature',
    summary: 'Add dark mode',
    businessJustification: 'Users have requested it repeatedly',
    acceptanceCriteria: ['Theme toggle in settings', 'Persists across sessions'],
  };

  it('always includes business justification', () => {
    const doc = buildFeatureDescription(base);

    expect(headingTexts(doc)).toContain('Business Justification');
    expect(paragraphTexts(doc)).toContain(base.businessJustification);
  });

  it('renders acceptance criteria as a bullet list when present', () => {
    const doc = buildFeatureDescription(base);

    expect(headingTexts(doc)).toContain('Acceptance Criteria');
    const list = doc.content.find((n) => n.type === 'bulletList');
    expect(list?.content).toHaveLength(2);
  });

  it('omits acceptance criteria heading and list when empty', () => {
    const doc = buildFeatureDescription({ ...base, acceptanceCriteria: [] });

    expect(headingTexts(doc)).not.toContain('Acceptance Criteria');
    expect(doc.content.some((n) => n.type === 'bulletList')).toBe(false);
  });

  it('includes priority only when provided', () => {
    const withPriority = buildFeatureDescription({ ...base, priority: 'High' });
    expect(headingTexts(withPriority)).toContain('Priority');

    const without = buildFeatureDescription(base);
    expect(headingTexts(without)).not.toContain('Priority');
  });

  it('mentions attachments only when present', () => {
    const withAttachment = buildFeatureDescription({
      ...base,
      attachments: [{ filename: 'mock.png', contentType: 'image/png', data: 'abc' }],
    });
    expect(paragraphTexts(withAttachment).some((t) => t.includes('attached'))).toBe(true);

    const without = buildFeatureDescription(base);
    expect(paragraphTexts(without).some((t) => t.includes('attached'))).toBe(false);
  });

  it('also renders embedded images and related links (shared with Bug tickets)', () => {
    const doc = buildFeatureDescription({
      ...base,
      embeddedImages: [{ url: 'https://example.com/mockup.png' }],
      links: [{ label: 'Design doc', url: 'https://example.com/design' }],
    });

    expect(headingTexts(doc)).toEqual(expect.arrayContaining(['Screenshots', 'Related Links']));
    expect(mediaSingleNodes(doc)).toHaveLength(1);
    expect(linkListEntries(doc)).toEqual([
      { type: 'text', text: 'Design doc', marks: [{ type: 'link', attrs: { href: 'https://example.com/design' } }] },
    ]);
  });
});
