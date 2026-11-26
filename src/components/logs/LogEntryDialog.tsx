import { useId, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { formatDate } from '../../lib/format';
import { clip, PREVIEW_CHARS, refOf, roleLabel } from '../../lib/logs';
import { REASON_REQUIRED, severityForKey } from '../../lib/severity';
import type { LogRow, Severity } from '../../lib/types';
import { SeverityBadge } from '../errors/SeverityBadge';
import { SeverityFieldset } from '../shared/SeverityFieldset';

export type Saved = { logged: boolean; severity: Severity | undefined; reason: string };

type Props = {
  /** The parent opens the dialog with ref.current.showModal() from the row's click handler. */
  dialogRef: RefObject<HTMLDialogElement | null>;
  entry: LogRow | null;
  /** What the server already holds for this entry. */
  saved: Saved;
  error: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (severity: Severity, reason: string | null) => void;
};

const button =
  'rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function EntryForm({
  entry,
  saved,
  error,
  saving,
  onCancel,
  onSave,
}: Omit<Props, 'dialogRef' | 'entry'> & { entry: LogRow }) {
  const id = useId();
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [reason, setReason] = useState(saved.reason);
  const { logged } = saved;
  const required = severity !== null && REASON_REQUIRED.includes(severity);
  const canSave = !logged && severity !== null && !(required && !reason.trim()) && !saving;

  const submit = () => {
    if (canSave && severity) onSave(severity, reason.trim() || null);
  };
  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    submit();
  };
  // 1-4 pick a severity unless the person is typing the reason; Ctrl+Enter logs.
  const onKeyDown = (event: KeyboardEvent) => {
    const picked = severityForKey(event.key);
    if (
      picked &&
      !logged &&
      !event.ctrlKey &&
      !event.metaKey &&
      !event.altKey &&
      !(event.target instanceof HTMLTextAreaElement)
    ) {
      event.preventDefault();
      setSeverity(picked);
    } else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <form
      method="dialog"
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      className="flex w-[34rem] max-w-full flex-col gap-3 p-5"
    >
      <h2 className="text-lg font-semibold text-fg">
        {logged ? 'Already in the error log' : 'Log as error'}
      </h2>
      <p className="text-xs text-muted">
        {[roleLabel(entry), entry.at ? formatDate(entry.at) : ''].filter(Boolean).join(' · ')}
      </p>
      <blockquote className="max-h-40 overflow-auto border-l-4 border-line pl-3 whitespace-pre-wrap text-muted">
        {clip(entry.text, PREVIEW_CHARS)}
      </blockquote>
      {logged ? (
        <p className="flex items-center gap-2 text-fg">
          Severity: <SeverityBadge severity={saved.severity} />
        </p>
      ) : (
        <SeverityFieldset name={`${id}-severity`} value={severity} onChange={setSeverity} />
      )}
      <label htmlFor={`${id}-reason`} className="font-medium text-fg">
        {required
          ? 'Why is this an error? (required for High and Send to IT)'
          : 'Why is this an error? (optional)'}
      </label>
      <textarea
        id={`${id}-reason`}
        rows={4}
        maxLength={2000}
        required={required}
        readOnly={logged}
        placeholder={logged ? 'No reason was given.' : 'What went wrong here?'}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
      <p className="text-xs text-muted">
        {logged
          ? "Reasons and severities can't be edited here. Esc to close."
          : '1–4 picks a severity · Ctrl+Enter to log · Esc to cancel'}
      </p>
      <p role="alert" className="min-h-6 text-danger">
        {error}
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className={`${button} border border-line text-fg hover:bg-page`}
        >
          {logged ? 'Close' : 'Cancel'}
        </button>
        {logged ? null : (
          <button
            type="submit"
            disabled={!canSave}
            className={`${button} bg-accent font-medium text-accent-fg! hover:opacity-90 disabled:opacity-50`}
          >
            Log as error
          </button>
        )}
      </div>
    </form>
  );
}

/** Confirms logging one entry. Native <dialog>: focus is trapped, Esc closes it and focus returns to the row. */
export function LogEntryDialog({ dialogRef, entry, ...rest }: Props) {
  return (
    <dialog
      ref={dialogRef}
      aria-label="Log as error"
      onClose={rest.onCancel}
      className="m-auto rounded-lg border border-line bg-surface text-fg backdrop:bg-black/50"
    >
      {entry ? (
        <EntryForm key={`${rest.saved.logged}:${refOf(entry)}:${entry.seq}`} entry={entry} {...rest} />
      ) : null}
    </dialog>
  );
}
