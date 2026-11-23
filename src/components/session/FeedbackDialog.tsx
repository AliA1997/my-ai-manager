import { useMutation } from '@tanstack/react-query';
import { useId, useState, type RefObject } from 'react';
import { FEEDBACK_CATEGORIES } from '../../lib/session';
import { useSessionContext } from './useSession';

const button =
  'rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50';
const chip = 'flex items-center gap-1 rounded-md border border-line px-2 py-1 text-fg';

function FeedbackForm({ onClose }: { onClose: () => void }) {
  const s = useSessionContext();
  const id = useId();
  const [rating, setRating] = useState<'up' | 'down' | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  const send = useMutation({
    mutationFn: (value: 'up' | 'down') =>
      s.run({ intent: 'feedback', key: s.key, rating: value, categories, text }),
    onSuccess: (res) => {
      onClose();
      if (res.chat) s.push({ type: 'chat', chat: res.chat });
      s.hint('Thanks. Your session feedback was sent to the agent.');
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Could not reach Claude Manager.'),
  });

  const toggle = (value: string): void =>
    setCategories(
      categories.includes(value) ? categories.filter((c) => c !== value) : [...categories, value],
    );

  return (
    <form
      method="dialog"
      onSubmit={(e) => {
        e.preventDefault();
        if (!rating) return setError('Pick 👍 or 👎.');
        send.mutate(rating);
      }}
      className="flex w-[30rem] max-w-full flex-col gap-3 p-5"
    >
      <h2 className="text-lg font-semibold text-fg">How is this session going?</h2>
      <fieldset className="flex gap-3">
        <legend className="mb-1 font-medium text-fg">Rating</legend>
        <label className={chip}>
          <input
            type="radio"
            name={`${id}-rating`}
            checked={rating === 'up'}
            onChange={() => setRating('up')}
          />
          👍 Good
        </label>
        <label className={chip}>
          <input
            type="radio"
            name={`${id}-rating`}
            checked={rating === 'down'}
            onChange={() => setRating('down')}
          />
          👎 Not good
        </label>
      </fieldset>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-1 font-medium text-fg">What stood out? (optional)</legend>
        {FEEDBACK_CATEGORIES.map((c) => (
          <label key={c.value} className={chip}>
            <input type="checkbox" checked={categories.includes(c.value)} onChange={() => toggle(c.value)} />
            {c.title}
          </label>
        ))}
      </fieldset>
      <label htmlFor={`${id}-text`} className="font-medium text-fg">
        Anything else? (optional)
      </label>
      <textarea
        id={`${id}-text`}
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
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
          disabled={send.isPending}
          className={`${button} bg-accent font-medium text-black hover:opacity-90`}
        >
          Send feedback
        </button>
      </div>
    </form>
  );
}

/** Session feedback: a rating, what stood out, and a note. The agent gets it as a message. */
export function FeedbackDialog({
  dialogRef,
  opened,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  /** Counts the openings: the form is rebuilt each time, so it starts clean. */
  opened: number;
}) {
  return (
    <dialog
      ref={dialogRef}
      aria-label="Session feedback"
      className="m-auto rounded-lg border border-line bg-surface text-fg backdrop:bg-black/50"
    >
      {opened > 0 ? <FeedbackForm key={opened} onClose={() => dialogRef.current?.close()} /> : null}
    </dialog>
  );
}
