// One-off connectivity smoke test for src/services/jira-integration.
// Run with: npm run verify:jira
// Creates several real, clearly-labeled tickets in your Jira project — delete
// them afterward once you've confirmed each one looks right.

import { createJiraTicket, TicketInput } from '../src/services/jira-integration';

// Smallest possible valid PNG (1x1 transparent pixel) — a standard test fixture,
// used here only to exercise the attachment upload path.
const TINY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

const scenarios: { name: string; input: TicketInput }[] = [
  {
    name: 'attached file',
    input: {
      type: 'Bug',
      summary: '[TEST] Jira integration smoke test — attached file',
      stepsToReproduce: ['Ran scripts/verify-jira.ts'],
      expectedBehavior: 'The ticket has a file attached to it.',
      actualBehavior: 'One-off connectivity check for the attachment upload path.',
      attachments: [{ filename: 'pixel.png', contentType: 'image/png', data: TINY_PNG_BASE64 }],
    },
  },
  {
    name: 'embedded image',
    input: {
      type: 'Bug',
      summary: '[TEST] Jira integration smoke test — embedded image',
      stepsToReproduce: ['Ran scripts/verify-jira.ts'],
      expectedBehavior: 'The description shows an image rendered inline under a "Screenshots" heading.',
      actualBehavior: 'One-off connectivity check for the external-image embed path.',
      embeddedImages: [{ url: 'https://placehold.co/300x150.png', alt: 'Placeholder test image' }],
    },
  },
  {
    name: 'external link',
    input: {
      type: 'Feature',
      summary: '[TEST] Jira integration smoke test — external link',
      businessJustification: 'One-off connectivity check for the related-links rendering path.',
      acceptanceCriteria: ['Description shows a "Related Links" section with a clickable link.'],
      links: [{ label: 'Example reference', url: 'https://example.com' }],
    },
  },
  {
    name: 'everything combined',
    input: {
      type: 'Feature',
      summary: '[TEST] Jira integration smoke test — attachment + image + link combined',
      businessJustification: 'One-off connectivity check exercising all content types together.',
      acceptanceCriteria: ['Attachment, embedded image, and related link all appear correctly.'],
      attachments: [{ filename: 'pixel.png', contentType: 'image/png', data: TINY_PNG_BASE64 }],
      embeddedImages: [{ url: 'https://placehold.co/300x150.png', alt: 'Placeholder test image' }],
      links: [{ label: 'Example reference', url: 'https://example.com' }],
    },
  },
];

async function main() {
  for (const { name, input } of scenarios) {
    console.log(`\n--- ${name} ---`);
    try {
      const result = await createJiraTicket(input);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`FAILED: ${(err as Error).message}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
