import { useMutation } from '@tanstack/react-query';
import { type RefObject, type SyntheticEvent } from 'react';
import { sendJson } from '../../lib/api';

type Props = {
  /** The page opens it again from the "Connect Claude" button. */
  dialogRef: RefObject<HTMLDialogElement | null>;
};

type Connected = { mode?: string; command?: string };

/** One click: the server opens a welcome page and starts Claude Code on it. Nothing to copy or type. */
export async function connect(): Promise<Connected> {
  const welcome = await sendJson<{ key?: unknown }>('/api/welcome', 'POST', {});
  if (typeof welcome.key !== 'string' || !/^[0-9a-f]{16}$/.test(welcome.key))
    throw new Error('unexpected response');
  return sendJson<Connected>(`/api/${welcome.key}/connect-claude`, 'POST', {});
}

/**
 * Shown every time the dashboard opens with no Claude agent connected, and the page renders it only then. It does
 * one thing: connect Claude, with one button. A native <dialog>, so focus is trapped (A11Y-4). It cannot be closed:
 * no close button, Esc does nothing, and a browser that closes it anyway sees it opened again. It goes away when an
 * agent connects.
 */
export function ConnectClaudeDialog({ dialogRef: ref }: Props) {
  const start = useMutation({ mutationFn: connect });
  // Runs on each draw: it opens the dialog in the browser whenever it is not open.
  const setRef = (node: HTMLDialogElement | null): void => {
    ref.current = node;
    if (node && !node.open) node.showModal();
  };
  const keepOpen = (event: SyntheticEvent): void => event.preventDefault(); // Esc
  const reopen = (): void => ref.current?.showModal(); // a browser that closed it anyway
  // No terminal could be opened for them (for example on a server): the one-line command is the way in.
  const manual = start.data?.mode === 'copy' ? start.data.command : undefined;
  return (
    <dialog
      ref={setRef}
      aria-labelledby="connect-claude-title"
      onCancel={keepOpen}
      onClose={reopen}
      className="m-auto w-[30rem] max-w-full rounded-lg border border-line bg-surface p-6 text-fg backdrop:bg-black/60"
    >
      <h2 id="connect-claude-title" className="mb-1 text-xl font-semibold">
        Connect your Claude agent
      </h2>
      <p className="mb-5 text-muted">
        My AI Manager is where you and your Claude agent give each other feedback, look over past sessions and
        work out how to improve them. Connect Claude to get started.
      </p>
      <button
        type="button"
        onClick={() => start.mutate()}
        disabled={start.isPending}
        className="mb-4 w-full rounded-md bg-accent px-4 py-3 text-base font-semibold text-accent-fg hover:opacity-90 disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        {start.isPending ? 'Starting Claude...' : 'Connect Claude'}
      </button>
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-muted">
        {start.isError ? (
          <span className="text-danger">Could not start Claude: {start.error.message}</span>
        ) : manual ? (
          <span>Claude could not open a window here. Run this in a terminal instead:</span>
        ) : start.isSuccess ? (
          <>
            <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-accent" />
            Claude is starting. This closes by itself when it connects.
          </>
        ) : (
          'This opens Claude Code for you.'
        )}
      </p>
      {manual ? (
        <p className="mt-2 rounded-md border border-line bg-page p-3 font-mono text-sm break-all select-all">
          {manual}
        </p>
      ) : null}
    </dialog>
  );
}
