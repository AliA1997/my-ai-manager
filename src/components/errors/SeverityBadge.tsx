import { memo } from 'react';
import { isSeverity, SEVERITY_TITLES } from '../../lib/severity';

const COLORS = {
  low: 'bg-sev-low text-sev-low-fg',
  medium: 'bg-sev-medium text-sev-medium-fg',
  high: 'bg-sev-high text-sev-high-fg',
  send_to_it: 'bg-sev-send-to-it text-sev-send-to-it-fg',
  unrated: 'bg-sev-unrated text-sev-unrated-fg',
} as const;

/** Always the text label, never color alone (A11Y-6). */
export const SeverityBadge = memo(function SeverityBadge({
  severity,
}: {
  severity?: string | null | undefined;
}) {
  const id = isSeverity(severity) ? severity : 'unrated';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${COLORS[id]}`}>
      {SEVERITY_TITLES[id]}
    </span>
  );
});
