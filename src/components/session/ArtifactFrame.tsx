import { memo, type KeyboardEvent } from 'react';
import { fileName, noteCount } from '../../lib/session';
import { revisionBarText } from '../../lib/session-ui';
import { useSessionContext } from './useSession';

/** One tab for each file the agent put up for review. Arrow keys, Home and End move between them. */
const OutputTabs = memo(function OutputTabs() {
  const s = useSessionContext();
  if (s.outputs.length < 2) return null;
  const index = s.outputs.findIndex((o) => o.id === s.currentOutput);
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const last = s.outputs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    if (next === null) return;
    event.preventDefault();
    const target = s.outputs[(next + s.outputs.length) % s.outputs.length];
    if (target) {
      s.selectOutput(target.id);
      document.getElementById(`output-tab-${target.id}`)?.focus();
    }
  };
  return (
    <div
      role="tablist"
      aria-label="Outputs in this review"
      onKeyDown={onKeyDown}
      className="flex gap-1 border-b border-line px-2 pt-2"
    >
      {s.outputs.map((o) => {
        const notes = noteCount(s.queue, o.id);
        const updated = Boolean(s.updatedOutputs[o.id]);
        const label = fileName(o.file) || o.id;
        const selected = o.id === s.currentOutput;
        return (
          <button
            key={o.id}
            id={`output-tab-${o.id}`}
            type="button"
            role="tab"
            tabIndex={selected ? 0 : -1}
            aria-selected={selected}
            aria-label={`${label}${notes ? `, ${notes} queued notes` : ''}${updated ? ', updated' : ''}`}
            title={`${o.kind}: ${o.file}`}
            onClick={() => s.selectOutput(o.id)}
            className={`rounded-t-md border border-b-0 px-3 py-1 focus-visible:outline-2 focus-visible:outline-accent ${
              selected
                ? 'border-line bg-surface font-medium text-fg'
                : 'border-transparent text-muted hover:text-fg'
            }`}
          >
            {label}
            {notes ? ` (${notes})` : ''}
            {updated ? ' •' : ''}
          </button>
        );
      })}
    </div>
  );
});

/**
 * The stage: output tabs, the read-only revision bar and the artifact. The frame stays sandboxed (opaque origin,
 * no same-origin access) and its URL carries the capability from the page data, as before (SEC-6).
 */
export const ArtifactFrame = memo(function ArtifactFrame() {
  const s = useSessionContext();
  const viewing = s.ui.viewing;
  return (
    <main className="flex min-w-0 flex-1 flex-col" aria-label="Artifact under review">
      {viewing ? (
        <div
          role="status"
          className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2 text-fg"
        >
          <span>{revisionBarText(viewing, s.latestRevision)}</span>
          <button
            type="button"
            onClick={s.showLatest}
            className="text-link underline focus-visible:outline-2 focus-visible:outline-accent"
          >
            Back to latest
          </button>
        </div>
      ) : null}
      <OutputTabs />
      <iframe
        key={`${s.currentOutput}:${s.frameReloads}`}
        ref={s.frameRef}
        title="Artifact under review"
        sandbox="allow-scripts allow-forms allow-popups"
        src={s.frameSrc}
        {...(viewing ? { srcDoc: viewing.html } : {})}
        className="w-full flex-1 border-0 bg-white"
      />
    </main>
  );
});
