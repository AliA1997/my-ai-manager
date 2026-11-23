import { memo, useRef } from 'react';
import { STAGE_TITLES } from '../../lib/home';
import { nextStageView, sameOriginUrl } from '../../lib/session';
import { STAGES } from '../../lib/types';
import { ConfirmDialog } from './ConfirmDialog';
import { useSessionContext } from './useSession';

const track: Record<string, string> = {
  done: 'border-green-700 text-fg',
  current: 'border-accent font-semibold text-fg',
  locked: 'border-line text-muted',
  skipped: 'border-line text-muted line-through',
};

/** The four stages of a feature, with a link to each that is open, and a way to skip the current one. */
export const WorkflowBar = memo(function WorkflowBar() {
  const s = useSessionContext();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const wf = s.workflow;
  if (!wf) return null;
  const canSkip = !s.ended && wf.current !== null && wf.current === s.stage;
  const skip = async (): Promise<void> => {
    try {
      const res = await s.run({ intent: 'skip-stage', key: s.key, workflowId: wf.id });
      const body = res.body ?? {};
      s.push({
        type: 'workflow',
        workflow: body.workflow,
        nextStage: {
          from: s.stage,
          next: typeof body.next === 'string' ? body.next : null,
          next_url: typeof body.next_url === 'string' ? body.next_url : null,
          next_key: typeof body.next_key === 'string' ? body.next_key : null,
          skipped: true,
        },
      });
    } catch (e) {
      s.hint(e instanceof Error ? e.message : 'Could not reach see-plan.', true);
    }
  };
  return (
    <section
      aria-label="Feature stages"
      className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-2"
    >
      <ol className="m-0 flex list-none flex-wrap gap-2 p-0">
        {STAGES.map((st, i) => {
          const info = wf.stages[st] ?? { status: 'locked', url: null, key: null };
          const label = `${i + 1}. ${STAGE_TITLES[st]}`;
          const linked = info.url && st !== s.stage && info.status !== 'locked';
          return (
            <li
              key={st}
              title={`${STAGE_TITLES[st]}: ${info.status}`}
              className={`rounded-md border px-2 py-0.5 ${track[info.status] ?? track.locked} ${st === s.stage ? 'bg-surface' : ''}`}
            >
              {linked && info.url ? (
                <a
                  href={info.url}
                  className="text-link underline focus-visible:outline-2 focus-visible:outline-accent"
                >
                  {label}
                </a>
              ) : (
                <span>{label}</span>
              )}
            </li>
          );
        })}
      </ol>
      {canSkip ? (
        <button
          type="button"
          onClick={() => dialogRef.current?.showModal()}
          className="text-link underline focus-visible:outline-2 focus-visible:outline-accent"
        >
          Skip to next stage
        </button>
      ) : null}
      <ConfirmDialog
        dialogRef={dialogRef}
        title={`Skip ${(wf.current && STAGE_TITLES[wf.current]) || 'this stage'}?`}
        text="The next stage opens without this stage's approval. You can still come back to this page."
        okLabel="Skip stage"
        onOk={() => void skip()}
      />
    </section>
  );
});

/** After a stage is approved or skipped: one click starts the next stage's Claude and opens its page. */
export const NextStageNotice = memo(function NextStageNotice() {
  const s = useSessionContext();
  const next = s.nextStage;
  if (!next || !s.workflow) return null;
  const { text, go } = nextStageView(next);
  const open = async (): Promise<void> => {
    if (!next.reopened && next.next_key) await s.connectNext(next.next_key);
    const url = sameOriginUrl(next.next_url);
    if (url) window.location.assign(url);
  };
  return (
    <section
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2"
    >
      <p className="text-fg">{text}</p>
      {go ? (
        <button
          type="button"
          onClick={() => void open()}
          className="rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          {go}
        </button>
      ) : null}
    </section>
  );
});
