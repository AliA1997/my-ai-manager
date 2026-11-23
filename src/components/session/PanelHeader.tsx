import { memo, useState } from 'react';
import { STAGE_TITLES } from '../../lib/home';
import { isInferred, isStage, timeAgo } from '../../lib/session';
import { useDocumentEvent } from '../../lib/subscribe';
import { STAGES } from '../../lib/types';
import type { Revision } from '../../routes/session';
import { useSessionContext } from './useSession';

const field =
  'rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent';
const linkButton = 'text-link underline focus-visible:outline-2 focus-visible:outline-accent';

function RevisionMenu() {
  const s = useSessionContext();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState<Revision[] | null>(null);
  const [failed, setFailed] = useState(false);
  const shownRevision = s.ui.viewing ? s.ui.viewing.n : s.latestRevision;
  // A click anywhere else closes the menu.
  useDocumentEvent('click', (event) => {
    if (open && !(event.target instanceof Element && event.target.closest('[data-revisions]')))
      setOpen(false);
  });

  const toggle = (): void => {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setList(null);
    setFailed(false);
    s.run({ intent: 'revisions', key: s.key, output: s.currentOutput }).then(
      (res) => setList(res.revisions ?? []),
      () => setFailed(true),
    );
  };
  const pick = (n: number): void => {
    setOpen(false);
    if (n === s.latestRevision) s.showLatest();
    else void s.showRevision(n);
  };

  return (
    <span data-revisions className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="revision-menu"
        onClick={toggle}
        className={field}
      >
        Revision r{shownRevision} ▾
      </button>
      {open ? (
        <span
          id="revision-menu"
          role="menu"
          className="absolute right-0 z-10 mt-1 flex w-56 flex-col rounded-md border border-line bg-surface p-1 shadow-lg"
        >
          {failed ? <span className="p-2 text-muted">Could not load revisions.</span> : null}
          {!failed && list === null ? <span className="p-2 text-muted">Loading…</span> : null}
          {list?.length === 0 ? <span className="p-2 text-muted">No earlier revisions yet.</span> : null}
          {list?.map((r) => (
            <button
              key={r.n}
              type="button"
              role="menuitem"
              onClick={() => pick(r.n)}
              className="rounded px-2 py-1 text-left text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent"
            >
              r{r.n}
              {r.n === s.latestRevision ? ' (latest)' : ''} · {timeAgo(r.at)}
            </button>
          ))}
        </span>
      ) : null}
    </span>
  );
}

/** The panel's top row: back to the dashboard, the stage label and the revision menu. */
export const PanelHeader = memo(function PanelHeader() {
  const s = useSessionContext();
  const inferred = isInferred(s.stage, s.stageSource);
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2">
      <a href="/" className={linkButton}>
        ← All sessions
      </a>
      <span className="flex items-center gap-2">
        <label htmlFor="stage-select" className="sr-only">
          Stage
        </label>
        <select
          id="stage-select"
          value={s.stage ?? ''}
          disabled={s.ended}
          title="What stage is this session?"
          onChange={(e) => void s.setStage(isStage(e.target.value) ? e.target.value : null)}
          className={field}
        >
          <option value="">No stage</option>
          {STAGES.map((st) => (
            <option key={st} value={st}>
              {STAGE_TITLES[st]}
            </option>
          ))}
        </select>
        {inferred ? (
          <span className="text-muted">
            (inferred){' '}
            <button type="button" onClick={() => void s.setStage(s.stage)} className={linkButton}>
              Confirm
            </button>
          </span>
        ) : null}
      </span>
      <RevisionMenu />
    </header>
  );
});
