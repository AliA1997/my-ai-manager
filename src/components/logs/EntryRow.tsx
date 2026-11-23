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

const kindClass: Record<string, string> = {
  tool_use: 'border-l-line italic',
  tool_result: 'border-l-line text-muted',
};

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
  const tone = kindClass[entry.kind ?? ''] ?? '';
  const side = entry.role === 'assistant' ? 'border-l-accent' : 'border-l-fg';

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
            'aria-label': `${roleLabel(entry)}: ${note ? 'add a note or log it' : 'log this entry as an error'}`,
            title: `${entry.at ? `${formatDate(entry.at)}\n` : ''}${
              note
                ? 'Click to add a note, send it to the agent, or log it as an error'
                : `Click to log this entry as an error in ${errorLog}`
            }`,
          }
        : {})}
      className={`my-2 rounded-md border border-l-4 border-line bg-surface p-3 ${side} ${tone} ${
        loggable ? 'cursor-pointer hover:bg-page focus-visible:outline-2 focus-visible:outline-accent' : ''
      } ${saving ? 'opacity-50' : ''}`}
    >
      <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted">
        <span className="font-semibold text-fg">{roleLabel(entry)}</span>
        {entry.at ? <time>{formatTime(entry.at)}</time> : null}
        {logged ? <SeverityBadge severity={severity} /> : null}
        {sent ? <span>Sent to agent</span> : null}
      </div>
      <div className="text-sm break-words whitespace-pre-wrap text-fg">{entry.text ?? ''}</div>
    </article>
  );
});
