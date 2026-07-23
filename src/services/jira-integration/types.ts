export interface TicketAttachment {
  filename: string;
  contentType: string;
  data: Buffer | string; // string = base64
}

export interface TicketLink {
  label: string;
  url: string;
}

export interface EmbeddedImage {
  url: string;
  alt?: string;
}

interface BaseTicketInput {
  summary: string;
  attachments?: TicketAttachment[];
  links?: TicketLink[];
  embeddedImages?: EmbeddedImage[];
}

export interface BugTicketInput extends BaseTicketInput {
  type: 'Bug';
  stepsToReproduce: string[];
  expectedBehavior: string;
  actualBehavior: string;
  environment?: string;
  severity?: 'Low' | 'Medium' | 'High' | 'Critical';
}

export interface FeatureTicketInput extends BaseTicketInput {
  type: 'Feature';
  businessJustification: string;
  acceptanceCriteria: string[];
  priority?: 'Low' | 'Medium' | 'High';
}

export type TicketInput = BugTicketInput | FeatureTicketInput;

export interface JiraTicketResult {
  issueKey: string;
  issueUrl: string;
  attachmentResults: { filename: string; ok: boolean; error?: string }[];
}

// Atlassian Document Format — minimal subset used by descriptionBuilders.ts
export interface ADFDocument {
  type: 'doc';
  version: 1;
  content: ADFNode[];
}

export type ADFNode =
  | { type: 'paragraph'; content: ADFInline[] }
  | { type: 'heading'; attrs: { level: number }; content: ADFInline[] }
  | { type: 'orderedList'; content: { type: 'listItem'; content: ADFNode[] }[] }
  | { type: 'bulletList'; content: { type: 'listItem'; content: ADFNode[] }[] }
  | { type: 'mediaSingle'; content: [ADFMediaNode] };

export interface ADFMediaNode {
  type: 'media';
  attrs: { type: 'external'; url: string; alt?: string };
}

export type ADFMark = { type: 'link'; attrs: { href: string } };

export type ADFInline = { type: 'text'; text: string; marks?: ADFMark[] };
