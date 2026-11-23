import { memo } from 'react';
import { basename } from '../../lib/format';
import { agentLabel, featureName, sessionStatus, STAGE_TITLES, timeAgo } from '../../lib/home';
import type { HomeSession, Workflow } from '../../lib/types';
import { linkClass } from '../shared/PageHeader';

const pillClass = {
  approved: 'bg-accent text-black',
  ended: 'bg-line text-fg',
  'notes waiting': 'bg-sev-medium text-sev-medium-fg',
  open: 'border border-line text-fg',
} as const;

type Props = {
  session: HomeSession;
  workflows: readonly Workflow[];
  history: boolean;
  busy: boolean;
  onArchive: (key: string) => void;
};

/** One session card, in the open list or in History. Loose sessions can be archived. */
export const SessionCard = memo(function SessionCard({
  session,
  workflows,
  history,
  busy,
  onArchive,
}: Props) {
  const status = sessionStatus(session);
  const feature = featureName(session, workflows);
  const stage = session.stage ? STAGE_TITLES[session.stage] : '';
  const agent = agentLabel(session);
  return (
    <article className="rounded-lg border border-line bg-surface p-3">
      <a href={session.url} title={session.file} className={`${linkClass} font-medium break-all`}>
        {basename(session.file)}
      </a>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
        <span className={`rounded-full px-2 py-0.5 ${pillClass[status]}`}>{status}</span>
        {feature || stage ? (
          <span className="text-muted">
            {feature ? `${feature} · ` : ''}
            {stage}
          </span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center justify-between text-xs text-muted">
        <span>
          {timeAgo(session.updated_at)}
          {agent && !history ? ` · ${agent}` : ''}
        </span>
        {history ? (
          <a href={session.url} className={linkClass}>
            Open
          </a>
        ) : !session.workflow_id ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => onArchive(session.key)}
            title="Hide this session from the dashboard (it comes back if it is opened again)"
            className="text-link underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
          >
            Archive
          </button>
        ) : null}
      </div>
    </article>
  );
});
