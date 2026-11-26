import { memo, type KeyboardEvent, type MouseEvent } from 'react';
import { formatDate, formatTime } from '../../lib/format';
import { refOf, roleLabel } from '../../lib/logs';
import type { LogRow, Severity } from '../../lib/types';
import { SeverityBadge } from '../errors/SeverityBadge';

type Props = {
  entry: LogRow;
  logged: boolean;
  severity: Severity | undefined;
  saving: boolean;
  errorLog: string;
  /** The row opens a choice (note the agent, log, or both), not only the log dialog. */
  note?: boolean;
  /** The entry was already sent to the agent. */
  sent?: boolean;
  onOpen: (entry: LogRow) => void;
};

type Tone = { row: string; label: string };

/** UX-9: each entry type has its own stripe and label colour (Lavish Axi log-* tokens); body text stays at full contrast. */
const USER: Tone = { row: 'border-l-log-user bg-user-bg', label: 'text-log-user' };
const TONES: Record<string, Tone> = {
  user: USER,
  assistant: { row: 'border-l-log-assistant bg-surface', label: 'text-log-assistant' },
  tool_use: { row: 'border-l-log-tool bg-code-bg', label: 'text-log-tool' },
  tool_result: { row: 'border-l-log-result bg-code-bg', label: 'text-log-result' },
  system: { row: 'border-l-log-system bg-surface', label: 'text-log-system' },
  error: { row: 'border-l-log-error bg-surface', label: 'text-log-error' },
};

function toneOf(entry: LogRow): Tone {
  return TONES[entry.kind ?? ''] ?? TONES[entry.role ?? ''] ?? USER;
}

/**
 * One transcript entry. The text is a text node (the transcript is untrusted, SEC-4). An entry that can be logged
 * is a native button-like row: it takes focus and Enter or Space, but a text selection is left alone for copying.
 */
export const EntryRow = memo(function EntryRow({
  entry,
  logged,
  severity,
  saving,
  errorLog,
  note = false,
  sent = false,
  onOpen,
}: Props) {
  const ref = refOf(entry);
  const loggable = ref !== '';
  const tone = toneOf(entry);

  const onClick = (event: MouseEvent<HTMLElement>) => {
    const selection = window.getSelection();
    if (selection && !selection.isCollapsed && event.currentTarget.contains(selection.anchorNode)) return;
    onOpen(entry);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(entry);
    }
  };

  return (
    <article
      {...(loggable
        ? {
            tabIndex: 0,
            role: 'button',
            onClick,
            onKeyDown,
            'aria-description': `${note ? 'add a note or log it' : 'log this entry as an error'}`,
            title: `${entry.at ? `${formatDate(entry.at)}\n` : ''}${
              note
                ? 'Click to add a note, send it to the agent, or log it as an error'
                : `Click to log this entry as an error in ${errorLog}`
            }`,
          }
        : {})}
      className={`my-2 p-3 border border-l-4 border-line rounded-lg ${tone.row} ${
        loggable
          ? 'cursor-pointer hover:brightness-95 focus-visible:outline-2 focus-visible:outline-accent'
          : ''
      } ${saving ? 'opacity-50' : ''}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className={`font-bold tracking-wide uppercase ${tone.label}`}>{roleLabel(entry)}</span>
        {entry.at ? <time>{formatTime(entry.at)}</time> : null}
        {logged ? <SeverityBadge severity={severity} /> : null}
        {sent ? <span>Sent to agent</span> : null}
      </div>
      <div className="font-mono text-[12.5px] leading-[19px] break-words whitespace-pre-wrap text-fg">
        {entry.text ?? ''}
      </div>
    </article>
  );
});
