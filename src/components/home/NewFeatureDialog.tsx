import { useId, useState, type FormEvent, type RefObject } from 'react';

type Props = {
  /** The parent opens the dialog with ref.current.showModal() from its click handler. */
  dialogRef: RefObject<HTMLDialogElement | null>;
  initialDir: string;
  error: string;
  saving: boolean;
  onCancel: () => void;
  onCreate: (input: { name: string; dir: string; requirements: string; startClaude: boolean }) => void;
};

const field =
  'rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent';

function FeatureForm({ initialDir, error, saving, onCancel, onCreate }: Omit<Props, 'dialogRef'>) {
  const id = useId();
  const [name, setName] = useState('');
  const [dir, setDir] = useState(initialDir);
  const [requirements, setRequirements] = useState('');
  const [startClaude, setStartClaude] = useState(true);
  const [local, setLocal] = useState('');

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim() || !dir.trim() || !requirements.trim()) {
      setLocal('Name, folder, and requirements are all needed.');
      return;
    }
    setLocal('');
    onCreate({ name: name.trim(), dir: dir.trim(), requirements, startClaude });
  };

  return (
    <form method="dialog" onSubmit={onSubmit} className="flex w-[34rem] max-w-full flex-col gap-3 p-5">
      <h2 className="text-lg font-semibold text-fg">New feature</h2>
      <label htmlFor={`${id}-name`} className="font-medium text-fg">
        Name{' '}
        <span className="text-xs font-normal text-muted">
          (letters, digits, dash; becomes the file prefix)
        </span>
      </label>
      <input
        id={`${id}-name`}
        required
        pattern="[A-Za-z0-9][A-Za-z0-9._\-]{0,63}"
        autoComplete="off"
        spellCheck={false}
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        className={field}
      />
      <label htmlFor={`${id}-dir`} className="font-medium text-fg">
        Folder{' '}
        <span className="text-xs font-normal text-muted">
          (absolute path; the plan files are written here)
        </span>
      </label>
      <input
        id={`${id}-dir`}
        required
        autoComplete="off"
        spellCheck={false}
        value={dir}
        onChange={(e) => setDir(e.target.value)}
        className={field}
      />
      <label htmlFor={`${id}-req`} className="font-medium text-fg">
        Requirements
      </label>
      <textarea
        id={`${id}-req`}
        rows={8}
        required
        placeholder="What should this feature do? One requirement per line works well."
        value={requirements}
        onChange={(e) => setRequirements(e.target.value)}
        className={field}
      />
      <label className="flex items-center gap-2 text-fg">
        <input type="checkbox" checked={startClaude} onChange={(e) => setStartClaude(e.target.checked)} />
        Start Claude for the Plan stage now
      </label>
      <p role="alert" className="min-h-6 text-danger">
        {local || error}
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
          disabled={saving}
          className="rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          Create feature
        </button>
      </div>
    </form>
  );
}

/** The New feature form in a native <dialog>: focus is trapped and Esc closes it (A11Y-4). */
export function NewFeatureDialog({ dialogRef, ...rest }: Props) {
  return (
    <dialog
      ref={dialogRef}
      aria-label="New feature"
      className="m-auto rounded-lg border border-line bg-surface text-fg backdrop:bg-black/50"
    >
      <FeatureForm {...rest} />
    </dialog>
  );
}
