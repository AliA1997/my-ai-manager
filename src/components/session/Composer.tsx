import { memo, useRef, useState, type KeyboardEvent } from 'react';
import { useDocumentEvent } from '../../lib/subscribe';
import { ConfirmDialog } from './ConfirmDialog';
import { useSessionContext } from './useSession';

const button =
  'rounded-md border border-line px-3 py-1 text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
const menuItem =
  'w-full rounded px-2 py-1 text-left text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

/** The message box, the mode switch, the "More" menu and Send. The confirmations are native dialogs. */
export const Composer = memo(function Composer() {
  const s = useSessionContext();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [ending, setEnding] = useState<'send' | 'end'>('end');
  const confirmRef = useRef<HTMLDialogElement>(null);
  const locked = s.ended || s.ui.sending;
  const unsent = s.queue.length + (text.trim() ? 1 : 0);

  // Escape and a click elsewhere close the menu; Ctrl+I switches the mode from anywhere on the page.
  useDocumentEvent('click', (event) => {
    if (menu && !(event.target instanceof Element && event.target.closest('[data-more]'))) setMenu(false);
  });
  useDocumentEvent('keydown', (event) => {
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      !event.shiftKey &&
      event.key.toLowerCase() === 'i'
    ) {
      event.preventDefault();
      s.toggleAnnotate();
    }
    if (event.key === 'Escape') setMenu(false);
  });

  const submit = (end: boolean): void => {
    const typed = text;
    setText('');
    void s.send(typed, end);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      submit(false);
    }
  };
  const confirmEnd = (withSend: boolean): void => {
    setMenu(false);
    setEnding(withSend ? 'send' : 'end');
    confirmRef.current?.showModal();
  };
  const commentOnPlan = (): void => {
    setMenu(false);
    if (!text.trim()) {
      s.hint('Type your comment on the whole plan first, then choose this again.');
      return;
    }
    s.enqueue({ prompt: text, tag: 'plan', selector: '', text: '' });
    setText('');
    s.hint('Queued as a comment on the whole plan.');
  };
  const copyHint = s.ui.hint;

  return (
    <section aria-label="Message the agent" className="flex flex-col gap-2 border-t border-line p-3">
      <label htmlFor="chat-input" className="sr-only">
        Message the agent
      </label>
      <textarea
        id="chat-input"
        rows={3}
        value={text}
        disabled={s.ended}
        placeholder="Message the agent"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        className="rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={s.ended}
          aria-pressed={s.annotate}
          title={
            s.annotate
              ? 'Clicks take notes. Switch to Interact to use the page (Ctrl+I).'
              : 'Clicks go to the page. Alt-click still takes a note (Ctrl+I).'
          }
          onClick={s.toggleAnnotate}
          className={button}
        >
          {s.annotate ? 'Mode: Annotate' : 'Mode: Interact'}
        </button>
        <span data-more className="relative">
          <button
            type="button"
            disabled={s.ended}
            aria-haspopup="menu"
            aria-expanded={menu}
            aria-controls="more-menu"
            onClick={() => setMenu(!menu)}
            className={button}
          >
            ⋯ More
          </button>
          {menu ? (
            <span
              id="more-menu"
              role="menu"
              className="absolute bottom-full left-0 z-10 mb-1 flex w-56 flex-col rounded-md border border-line bg-surface p-1 shadow-lg"
            >
              <button type="button" role="menuitem" autoFocus onClick={commentOnPlan} className={menuItem}>
                Comment on the whole plan
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={locked}
                onClick={() => confirmEnd(true)}
                className={menuItem}
              >
                Send &amp; End
              </button>
              <button
                type="button"
                role="menuitem"
                disabled={locked}
                onClick={() => confirmEnd(false)}
                className={`${menuItem} text-danger`}
              >
                End session
              </button>
              <form method="post" action="/api/auth/signout" target="_top">
                <button
                  type="submit"
                  role="menuitem"
                  title="Sign out this browser and disconnect the agent"
                  className={menuItem}
                >
                  Sign out
                </button>
              </form>
            </span>
          ) : null}
        </span>
        <button
          type="button"
          disabled={locked}
          onClick={() => submit(false)}
          className="ml-auto rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          Send to Agent
        </button>
      </div>
      <p
        role="status"
        aria-live="polite"
        className={`min-h-6 text-sm ${copyHint.error ? 'text-danger' : 'text-muted'}`}
      >
        {copyHint.text}
      </p>
      <ConfirmDialog
        dialogRef={confirmRef}
        title={ending === 'send' ? 'Send and end the session?' : 'End the session?'}
        text={
          ending === 'send'
            ? 'Your notes are sent, then the session ends. The agent stops listening.'
            : unsent
              ? `You have ${unsent} unsent note(s); they will not be sent. The agent stops listening.`
              : 'The agent stops listening. You can resume later and keep the history.'
        }
        okLabel={ending === 'send' ? 'Send & End' : 'End session'}
        onOk={() => (ending === 'send' ? submit(true) : void s.endSession())}
      />
    </section>
  );
});
