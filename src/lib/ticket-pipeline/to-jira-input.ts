import type { BugTicketInput, FeatureTicketInput, TicketInput } from '@/services/jira-integration';
import type { NormalizedInput, TriageResult } from './types';

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

function formatEnvironment(env: NormalizedInput['environment']): string | undefined {
  if (!env) return undefined;
  const parts = [env.url, env.browser, env.os, env.appVersion].filter(Boolean);
  return parts.length > 0 ? parts.join(' | ') : undefined;
}

/** Turn the pipeline's neutral evidence + triage decision into what the Jira client expects. */
export function toTicketInput(normalized: NormalizedInput, triage: TriageResult): TicketInput {
  const stepsOrActions = normalized.entities.userActions?.length
    ? normalized.entities.userActions
    : normalized.observations.map((o) => o.statement);

  if (triage.type === 'bug') {
    const bug: BugTicketInput = {
      type: 'Bug',
      summary: normalized.summary,
      stepsToReproduce: stepsOrActions,
      expectedBehavior: normalized.intent,
      actualBehavior: normalized.summary,
      environment: formatEnvironment(normalized.environment),
      severity: PRIORITY_TO_SEVERITY[triage.priority],
    };
    return bug;
  }

  const feature: FeatureTicketInput = {
    type: 'Feature',
    summary: normalized.summary,
    businessJustification: normalized.intent,
    acceptanceCriteria: stepsOrActions,
    priority: PRIORITY_TO_FEATURE_PRIORITY[triage.priority],
  };
  return feature;
}
