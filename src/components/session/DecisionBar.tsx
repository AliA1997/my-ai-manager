import { useMutation } from '@tanstack/react-query';
import { memo, useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/api';
import { approveLabel } from '../../lib/session';
import { useSessionContext } from './useSession';

const button =
  'rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';

type Choice = 'approve' | 'request-changes';

function DecisionForm({ choice, onClose }: { choice: Choice; onClose: () => void }) {
  const s = useSessionContext();
  const id = useId();
  const approve = choice === 'approve';
  const label = approveLabel(s.stage);
  const unsent = s.queue.length;
  const [comment, setComment] = useState('');
  const [force, setForce] = useState(false);
  const [error, setError] = useState(
    approve && unsent ? `You have ${unsent} unsent note(s). Send them first, or approve anyway.` : '',
  );

  const decide = useMutation({
    mutationFn: () =>
      s.run({ intent: 'decision', key: s.key, decision: choice, comment: comment.trim(), force }),
    onSuccess: (res) => {
      const body = res.body ?? {};
      onClose();
      if (approve) {
        s.hint('Approved.');
        s.markEnded('approved');
      } else {
        s.hint('Change request sent.');
      }
      if (body.workflow || body.next !== undefined) {
        s.push({
          type: 'workflow',
          workflow: body.workflow,
          nextStage:
            body.next !== undefined && s.workflow
              ? {
                  from: s.stage,
                  next: typeof body.next === 'string' ? body.next : null,
                  next_url: typeof body.next_url === 'string' ? body.next_url : null,
                  next_key: typeof body.next_key === 'string' ? body.next_key : null,
                  reopened: !approve,
                }
              : undefined,
        });
      }
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'UNSENT_NOTES') {
        setForce(true);
        setError(`${e.message || 'Notes have not reached the agent yet'}. Approve anyway?`);
      } else {
        setError(e instanceof Error ? e.message : 'Could not reach Claude Manager.');
      }
    },
  });

  const submit = (): void => {
    if (!approve && !comment.trim()) return setError('Say what should change.');
    decide.mutate();
  };

  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="flex w-[30rem] max-w-full flex-col gap-3 p-5"
    >
      <h2 className="text-lg font-semibold text-fg">{approve ? `${label}?` : 'Request changes'}</h2>
      <label htmlFor={`${id}-comment`} className="font-medium text-fg">
        {approve ? 'Comment (optional)' : 'What should change?'}
      </label>
      <textarea
        id={`${id}-comment`}
        rows={4}
        autoFocus
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        aria-describedby={`${id}-error`}
        className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent"
      />
      <p id={`${id}-error`} role="alert" className="min-h-6 text-danger">
        {error}
      </p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onClose}
          className={`${button} border border-line text-fg hover:bg-page`}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={decide.isPending}
          className={`${button} bg-accent font-medium text-black hover:opacity-90`}
        >
          {approve ? (unsent || force ? 'Approve anyway' : label) : 'Send request'}
        </button>
      </div>
    </form>
  );
}

/** Approve the stage or ask for changes. The dialog is rebuilt each time it opens, so it starts clean. */
export const DecisionBar = memo(function DecisionBar() {
  const s = useSessionContext();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [choice, setChoice] = useState<Choice | null>(null);
  const [opened, setOpened] = useState(0);
  if (s.ended || !(s.page.has_plan || s.stage)) return null;
  const locked = s.ui.sending;
  const open = (next: Choice): void => {
    setChoice(next);
    setOpened(opened + 1);
    dialogRef.current?.showModal();
  };
  const close = (): void => {
    dialogRef.current?.close();
    setChoice(null);
  };
  return (
    <div className="flex gap-2 border-t border-line p-3">
      <button
        type="button"
        disabled={locked}
        onClick={() => open('approve')}
        className={`${button} bg-green-700 font-medium text-white hover:opacity-90`}
      >
        {approveLabel(s.stage)}
      </button>
      <button
        type="button"
        disabled={locked}
        onClick={() => open('request-changes')}
        className={`${button} border border-line text-fg hover:bg-page`}
      >
        Request changes
      </button>
      <dialog
        ref={dialogRef}
        aria-label="Decision"
        onClose={() => setChoice(null)}
        className="m-auto rounded-lg border border-line bg-surface text-fg backdrop:bg-black/50"
      >
        {choice ? <DecisionForm key={opened} choice={choice} onClose={close} /> : null}
      </dialog>
    </div>
  );
});
