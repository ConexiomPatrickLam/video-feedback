import { ADFDocument, ADFInline, ADFNode, BugTicketInput, EmbeddedImage, FeatureTicketInput, StepScreenshot, TicketLink } from './types';

function paragraph(text: string): ADFNode {
  return { type: 'paragraph', content: [{ type: 'text', text }] };
}

function heading(text: string, level = 3): ADFNode {
  return { type: 'heading', attrs: { level }, content: [{ type: 'text', text }] };
}

/** Builds the "Steps to Reproduce" list, embedding a screenshot inline under
 * its matching step when one was resolved. */
function orderedListWithScreenshots(items: string[], screenshots?: StepScreenshot[]): ADFNode {
  const byStepIndex = new Map((screenshots ?? []).map((s) => [s.stepIndex, s]));

  return {
    type: 'orderedList',
    content: items.map((item, i) => {
      const shot = byStepIndex.get(i);
      const stepContent: ADFNode[] = [paragraph(item)];
      if (shot) stepContent.push(externalImage({ url: shot.url, alt: shot.alt }));
      return { type: 'listItem', content: stepContent };
    }),
  };
}

function bulletList(items: string[]): ADFNode {
  return {
    type: 'bulletList',
    content: items.map((item) => ({ type: 'listItem', content: [paragraph(item)] })),
  };
}

function linkText(link: TicketLink): ADFInline {
  return { type: 'text', text: link.label, marks: [{ type: 'link', attrs: { href: link.url } }] };
}

function linkList(links: TicketLink[]): ADFNode {
  return {
    type: 'bulletList',
    content: links.map((link) => ({ type: 'listItem', content: [{ type: 'paragraph', content: [linkText(link)] }] })),
  };
}

function externalImage(image: EmbeddedImage): ADFNode {
  return {
    type: 'mediaSingle',
    content: [{ type: 'media', attrs: { type: 'external', url: image.url, alt: image.alt } }],
  };
}

function appendCommonSections(
  content: ADFNode[],
  input: { attachments?: unknown[]; links?: TicketLink[]; embeddedImages?: EmbeddedImage[] }
): void {
  if (input.embeddedImages?.length) {
    content.push(heading('Screenshots'), ...input.embeddedImages.map(externalImage));
  }
  if (input.links?.length) {
    content.push(heading('Related Links'), linkList(input.links));
  }
  if (input.attachments?.length) {
    content.push(paragraph('See attached screenshots/files.'));
  }
}

export function buildBugDescription(input: BugTicketInput): ADFDocument {
  const content: ADFNode[] = [];

  if (input.stepsToReproduce.length > 0) {
    content.push(
      heading('Steps to Reproduce'),
      orderedListWithScreenshots(input.stepsToReproduce, input.stepScreenshots),
    );
  }

  content.push(heading('Expected Behavior'), paragraph(input.expectedBehavior));
  content.push(heading('Actual Behavior'), paragraph(input.actualBehavior));

  if (input.environment) {
    content.push(heading('Environment'), paragraph(input.environment));
  }
  if (input.severity) {
    content.push(heading('Severity'), paragraph(input.severity));
  }

  appendCommonSections(content, input);

  return { type: 'doc', version: 1, content };
}

export function buildFeatureDescription(input: FeatureTicketInput): ADFDocument {
  const content: ADFNode[] = [];

  content.push(heading('Business Justification'), paragraph(input.businessJustification));

  if (input.acceptanceCriteria.length > 0) {
    content.push(heading('Acceptance Criteria'), bulletList(input.acceptanceCriteria));
  }
  if (input.priority) {
    content.push(heading('Priority'), paragraph(input.priority));
  }

  appendCommonSections(content, input);

  return { type: 'doc', version: 1, content };
}
