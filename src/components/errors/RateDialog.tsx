import { useId, useState, type FormEvent, type KeyboardEvent, type RefObject } from 'react';
import { REASON_REQUIRED, severityForKey } from '../../lib/severity';
import type { ErrorItem, Severity } from '../../lib/types';
import { SeverityFieldset } from '../shared/SeverityFieldset';

type Props = {
  /** The parent opens the dialog with ref.current.showModal() from its click handler. */
  dialogRef: RefObject<HTMLDialogElement | null>;
  item: ErrorItem | null;
  error: string;
  saving: boolean;
  onCancel: () => void;
  onSave: (severity: Severity, reason: string | null) => void;
};

function RateForm({
  item,
  error,
  saving,
  onCancel,
  onSave,
}: Omit<Props, 'dialogRef' | 'item'> & { item: ErrorItem }) {
  const id = useId();
  const [severity, setSeverity] = useState<Severity | null>(null);
  const [reason, setReason] = useState(item.reason ?? '');
  const locked = Boolean(item.reason); // a reason that already exists can't be changed
  const required = severity !== null && REASON_REQUIRED.includes(severity) && !locked;
  const canSave = severity !== null && !(required && !reason.trim()) && !saving;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (severity) onSave(severity, locked ? null : reason.trim() || null);
  };

  // 1-4 pick a severity, as long as the person is not typing the reason.
  const onKeyDown = (event: KeyboardEvent) => {
    const picked = severityForKey(event.key);
    if (picked && event.target instanceof HTMLInputElement && event.target.type === 'radio')
      setSeverity(picked);
  };

  return (
    <form
      method="dialog"
      onSubmit={onSubmit}
      onKeyDown={onKeyDown}
      className="flex w-[32rem] max-w-full flex-col gap-3 p-5"
    >
      <h2 id={`${id}-title`} className="text-lg font-semibold text-fg">
        Rate this error
      </h2>
      <blockquote className="max-h-40 overflow-auto border-l-4 border-line pl-3 whitespace-pre-wrap text-muted">
        {item.text}
        {item.truncated ? '…' : ''}
      </blockquote>
      <SeverityFieldset name={`${id}-severity`} value={severity} onChange={setSeverity} />
      <label htmlFor={`${id}-reason`} className="font-medium text-fg">
        {required
          ? 'Why is this an error? (required for High and Send to IT)'
          : 'Why is this an error? (optional)'}
      </label>
      <textarea
        id={`${id}-reason`}
        rows={3}
        maxLength={2000}
        required={required}
        readOnly={locked}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
      <p className="text-xs text-muted">A severity can be set once. Esc to cancel.</p>
      <p role="alert" className="min-h-6 text-danger">
        {error}
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-line px-3 py-1 text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={!canSave}
          className="rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          Save severity
        </button>
      </div>
    </form>
  );
}

/** One-time rating of an unrated record (D6). Native <dialog>: focus is trapped and Esc closes it. */
export function RateDialog({ dialogRef, item, ...rest }: Props) {
  return (
    <dialog
      ref={dialogRef}
      aria-label="Rate this error"
      onClose={rest.onCancel}
      className="m-auto rounded-lg border border-line bg-surface text-fg backdrop:bg-black/50"
    >
      {item ? (
        <RateForm key={`${item.claude_session_id}:${item.uuid}:${item.part}`} item={item} {...rest} />
      ) : null}
    </dialog>
  );
}
