import { useId, useState, type KeyboardEvent, type RefObject } from 'react';
import { clip, PREVIEW_CHARS, roleLabel } from '../../lib/logs';
import { REASON_REQUIRED, severityForKey } from '../../lib/severity';
import type { LogRow, Severity } from '../../lib/types';
import { SeverityFieldset } from '../shared/SeverityFieldset';

export type NoteChoice = { toAgent: boolean; asError: boolean };

type Props = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  entry: LogRow | null;
  /** The entry was already sent to the agent, or the session has ended. */
  alreadySent: boolean;
  ended: boolean;
  onCancel: () => void;
  onChoose: (choice: NoteChoice, severity: Severity | null, note: string) => void;
};

const button =
  'rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

function NoteForm({
  entry,
  alreadySent,
  ended,
  onCancel,
  onChoose,
}: Omit<Props, 'dialogRef' | 'entry'> & { entry: LogRow }) {
  const id = useId();
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [note, setNote] = useState('');
  const required = severity !== null && REASON_REQUIRED.includes(severity);
  const canLog = severity !== null && !(required && !note.trim());
  const canSend = !ended && !alreadySent;

  // 1-4 pick a severity unless the note is being typed.
  const onKeyDown = (event: KeyboardEvent): void => {
    const picked = severityForKey(event.key);
    if (
      picked &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      setSeverity(picked);
    }
  };

  return (
    <form
      method="dialog"
      onKeyDown={onKeyDown}
      onSubmit={(e) => e.preventDefault()}
      className="flex w-[34rem] max-w-full flex-col gap-3 p-5"
    >
      <h2 className="text-lg font-semibold text-fg">Claude log entry</h2>
      <p className="text-xs text-muted">{roleLabel(entry)}</p>
      <blockquote className="max-h-32 overflow-auto border-l-4 border-line pl-3 whitespace-pre-wrap text-muted">
        {clip(entry.text, PREVIEW_CHARS)}
      </blockquote>
      <SeverityFieldset name={`${id}-severity`} value={severity} onChange={setSeverity} />
      <label htmlFor={`${id}-note`} className="font-medium text-fg">
        {required
          ? 'Note to agent / reason (required for High and Send to IT)'
          : 'Note to agent / reason (optional)'}
      </label>
      <textarea
        id={`${id}-note`}
        rows={3}
        value={note}
        placeholder="What went wrong here?"
        onChange={(e) => setNote(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
      {alreadySent ? <p className="text-sm text-muted">That entry was already sent to the agent.</p> : null}
      <p className="text-xs text-muted">
        Pick a severity to log it as an error. 1–4 picks one · Esc to cancel
      </p>
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" onClick={onCancel} className={`${button} text-link underline`}>
          Cancel
        </button>
        <button
          type="button"
          disabled={!canSend}
          onClick={() => onChoose({ toAgent: true, asError: false }, severity, note.trim())}
          className={`${button} bg-accent font-medium text-black hover:opacity-90`}
        >
          Send to agent
        </button>
        <button
          type="button"
          disabled={!canLog}
          onClick={() => onChoose({ toAgent: false, asError: true }, severity, note.trim())}
          className={`${button} border border-line text-fg hover:bg-page`}
        >
          Log as error
        </button>
        <button
          type="button"
          disabled={!canLog || !canSend}
          onClick={() => onChoose({ toAgent: true, asError: true }, severity, note.trim())}
          className={`${button} border border-line text-fg hover:bg-page`}
        >
          Both
        </button>
      </div>
    </form>
  );
}

/** What to do with one Claude log entry: tell the agent, log it as an error, or both. A native <dialog> (A11Y-4). */
export function LogNoteDialog({ dialogRef, entry, ...rest }: Props) {
  return (
    <dialog
      ref={dialogRef}
      aria-label="Claude log entry"
      onClose={rest.onCancel}
      className="m-auto rounded-lg border border-line bg-surface text-fg backdrop:bg-black/50"
    >
      {entry ? <NoteForm key={`${entry.uuid ?? ''}:${entry.seq}`} entry={entry} {...rest} /> : null}
    </dialog>
  );
}
