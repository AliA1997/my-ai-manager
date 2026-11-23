import type { Severity, SeverityFilter } from './types';
import { SEVERITIES } from './types';

export const SEVERITY_TITLES: Record<SeverityFilter, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  send_to_it: 'Send to IT',
  unrated: 'Unrated',
};

/** These severities need a written reason before they can be saved. */
export const REASON_REQUIRED: readonly Severity[] = ['high', 'send_to_it'];

export const FILTER_VALUES: readonly SeverityFilter[] = [...SEVERITIES, 'unrated'];

export function isSeverity(value: unknown): value is Severity {
  return typeof value === 'string' && (SEVERITIES as readonly string[]).includes(value);
}

export function isFilter(value: unknown): value is SeverityFilter {
  return typeof value === 'string' && (FILTER_VALUES as readonly string[]).includes(value);
}

/** Keys 1-4 pick a severity in the rate and log dialogs. */
export function severityForKey(key: string): Severity | null {
  return /^[1-4]$/.test(key) ? (SEVERITIES[Number(key) - 1] ?? null) : null;
}
