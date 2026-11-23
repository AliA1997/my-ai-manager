import { memo } from 'react';
import { agentLabel, STAGE_TITLES, STAGES } from '../../lib/home';
import type { HomeSession, Workflow } from '../../lib/types';
import { linkClass } from '../shared/PageHeader';

const stepClass = {
  locked: 'border-line text-muted',
  current: 'border-accent font-semibold text-fg',
  done: 'border-line text-fg',
  skipped: 'border-line text-muted line-through',
} as const;

/** One feature: its four-stage tracker and a button to the current stage. Every string is a text node (SEC-4). */
export const FeatureCard = memo(function FeatureCard({
  workflow,
  sessions,
}: {
  workflow: Workflow;
  sessions: ReadonlyMap<string, HomeSession>;
}) {
  const current = workflow.current ? workflow.stages?.[workflow.current]?.key : null;
  const currentSession = current ? sessions.get(current) : undefined;
  return (
    <article className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-3">
        <h3 className="text-lg font-semibold text-fg">{workflow.name}</h3>
        <span className="text-xs break-all text-muted">{workflow.dir}</span>
      </div>
      <ol className="mb-3 grid gap-2 sm:grid-cols-4">
        {STAGES.map((stage, i) => {
          const st = workflow.stages?.[stage] ?? { status: 'locked' as const };
          const session = st.key ? sessions.get(st.key) : undefined;
          const label = `${i + 1}. ${STAGE_TITLES[stage]}`;
          const agent = agentLabel(session);
          return (
            <li key={stage} className={`flex flex-col rounded-md border px-3 py-2 ${stepClass[st.status]}`}>
              {session && st.status !== 'locked' ? (
                <a href={session.url} className={linkClass}>
                  {label}
                </a>
              ) : (
                <span>{label}</span>
              )}
              <span className="text-xs text-muted">
                {st.status}
                {agent && st.status === 'current' ? ` · ${agent}` : ''}
              </span>
            </li>
          );
        })}
      </ol>
      {currentSession && workflow.current ? (
        <a
          href={currentSession.url}
          className="inline-block rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          Open {STAGE_TITLES[workflow.current]} →
        </a>
      ) : !workflow.current ? (
        <span className="text-muted">All stages finished ✓</span>
      ) : null}
    </article>
  );
});
