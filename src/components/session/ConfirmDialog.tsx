import type { RefObject } from 'react';

const button =
  'rounded-md px-3 py-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/** A yes/no question in a native <dialog>: focus is trapped, Esc means no, and the safe choice has focus first. */
export function ConfirmDialog({
  dialogRef,
  title,
  text,
  okLabel,
  onOk,
}: {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: string;
  text: string;
  okLabel: string;
  onOk: () => void;
}) {
  const close = (): void => dialogRef.current?.close();
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="confirm-title"
      className="m-auto w-[28rem] max-w-full rounded-lg border border-line bg-surface p-5 text-fg backdrop:bg-black/50"
    >
      <h2 id="confirm-title" className="mb-2 text-lg font-semibold">
        {title}
      </h2>
      <p className="mb-4 text-muted">{text}</p>
      <div className="flex justify-end gap-3">
        <button
          type="button"
          autoFocus
          onClick={close}
          className={`${button} border border-line text-fg hover:bg-page`}
        >
          Keep working
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            onOk();
          }}
          className={`${button} bg-danger font-medium text-danger-fg! hover:opacity-90`}
        >
          {okLabel}
        </button>
      </div>
    </dialog>
  );
}
