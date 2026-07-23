import type { BugTicketInput, FeatureTicketInput, TicketInput } from '@/services/jira-integration';
import type { BugContent, ComposedContent, FeatureContent, TriageResult } from './types';

const PRIORITY_TO_SEVERITY: Record<TriageResult['priority'], NonNullable<BugTicketInput['severity']>> = {
  lowest: 'Low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  highest: 'Critical',
};

const PRIORITY_TO_FEATURE_PRIORITY: Record<TriageResult['priority'], NonNullable<FeatureTicketInput['priority']>> = {
  lowest: 'Low',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  highest: 'High',
};

// Jira's summary field is capped at 255 chars; guard against an over-long title.
const MAX_SUMMARY = 255;
function toSummary(text: string): string {
  return text.length <= MAX_SUMMARY ? text : `${text.slice(0, MAX_SUMMARY - 1).trimEnd()}…`;
}

/** Turn the composed ticket content + triage decision into what the Jira client expects. */
export function toTicketInput(content: ComposedContent, triage: TriageResult): TicketInput {
  if (triage.type === 'bug') {
    const bug = content as BugContent;
    const ticket: BugTicketInput = {
      type: 'Bug',
      summary: toSummary(bug.summary),
      stepsToReproduce: bug.stepsToReproduce,
      expectedBehavior: bug.expectedBehavior,
      actualBehavior: bug.actualBehavior,
      environment: bug.environment,
      severity: PRIORITY_TO_SEVERITY[triage.priority],
    };
    return ticket;
  }

  const feature = content as FeatureContent;
  const ticket: FeatureTicketInput = {
    type: 'Feature',
    summary: toSummary(feature.summary),
    businessJustification: feature.businessJustification,
    acceptanceCriteria: feature.acceptanceCriteria,
    priority: PRIORITY_TO_FEATURE_PRIORITY[triage.priority],
  };
  return ticket;
}
