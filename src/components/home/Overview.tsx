import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, type ReactNode } from 'react';
import { clip } from '../../lib/logs';
import { basename, claudeHref } from '../../lib/format';
import { timeAgo } from '../../lib/home';
import {
  errorsQuery,
  OVERVIEW_ERRORS,
  OVERVIEW_PROJECTS,
  plansQuery,
  projectsQuery,
  recentNotificationsQuery,
} from '../../lib/queries';
import { action as notificationsAction } from '../../routes/notifications';
import { SeverityBadge } from '../errors/SeverityBadge';
import { linkClass, PageLink } from '../shared/PageHeader';

function Panel({
  id,
  title,
  link,
  children,
}: {
  id: string;
  title: string;
  link: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-3"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={id} className="text-lg font-semibold text-fg">
          {title}
        </h2>
        {link}
      </div>
      {children}
    </section>
  );
}

const empty = (text: string) => <p className="text-muted">{text}</p>;

/** The newest errors from sessions, with how bad each is. */
const ErrorsPanel = memo(function ErrorsPanel() {
  const { data, isError } = useQuery(errorsQuery('session', {}));
  const items = data?.items.slice(0, OVERVIEW_ERRORS) ?? [];
  return (
    <Panel id="overview-errors" title="Errors" link={<PageLink to="/errors">All error logs</PageLink>}>
      {isError ? empty('Could not load the errors.') : null}
      {data && items.length === 0 ? empty('No errors logged.') : null}
      <ul className="flex flex-col gap-2">
        {items.map((e) => (
          <li key={e.id ?? `${e.claude_session_id}:${e.uuid}:${e.part}`} className="text-sm">
            <span className="mr-2">
              <SeverityBadge severity={e.severity} />
            </span>
            <a
              href={claudeHref(e.claude_session_id)}
              className={`${linkClass} break-words`}
              title="Open the Claude session this came from"
            >
              {clip(e.reason || e.text, 90)}
            </a>
            {e.reported_at ? <span className="ml-2 text-xs text-muted">{timeAgo(e.reported_at)}</span> : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
});

/** The plans of the first few projects see knows, each opening its review. */
const PlansPanel = memo(function PlansPanel() {
  const { data: projects, isError } = useQuery(projectsQuery());
  const shown = projects?.projects.slice(0, OVERVIEW_PROJECTS) ?? [];
  const plans = useQueries({ queries: shown.map((p) => plansQuery(p.key)) });
  const rows = shown.flatMap((p, i) =>
    (plans[i]?.data?.items ?? []).slice(0, 5).map((plan) => ({ project: p.name, plan })),
  );
  return (
    <Panel id="overview-plans" title="Plans" link={<PageLink to="/errors">By project</PageLink>}>
      {isError ? empty('Could not load the projects.') : null}
      {projects && rows.length === 0 ? empty('No plans yet. Run see <file> in a project.') : null}
      <ul className="flex flex-col gap-2">
        {rows.map(({ project, plan }) => (
          <li key={`${project}:${plan.name}`} className="text-sm">
            {plan.review_key ? (
              <a
                href={`/session/${encodeURIComponent(plan.review_key)}`}
                className={`${linkClass} break-all`}
              >
                {plan.title || basename(plan.name)}
              </a>
            ) : (
              <span className="break-all text-fg">{plan.title || basename(plan.name)}</span>
            )}
            <span className="ml-2 text-xs text-muted">{project}</span>
            {plan.error_count ? (
              <span className="ml-2">
                <SeverityBadge severity={plan.worst_severity} />
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
});

/** The last ten notifications, newest first. */
const NotificationsPanel = memo(function NotificationsPanel() {
  const { data, isError } = useQuery(recentNotificationsQuery());
  const items = data?.items ?? [];
  const queryClient = useQueryClient();
  const read = useMutation({
    mutationFn: (id: string) => notificationsAction({ intent: 'mark-read', id }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });
  return (
    <Panel
      id="overview-notifications"
      title="Recent notifications"
      link={<PageLink to="/notifications">All notifications</PageLink>}
    >
      {isError ? empty('Could not load the notifications.') : null}
      {read.isError ? (
        <p role="alert" className="text-danger">
          {read.error.message}
        </p>
      ) : null}
      {data && items.length === 0 ? empty('No notifications.') : null}
      <ul className="flex flex-col gap-2">
        {items.map((n) => (
          <li key={n.id} className={`flex items-start gap-2 text-sm ${n.read ? 'text-muted' : 'text-fg'}`}>
            <span className="flex-1">
              <span className="font-medium">{n.title}</span>
              {n.message ? <span className="ml-2">{clip(n.message, 90)}</span> : null}
              {n.at ? <span className="ml-2 text-xs text-muted">{timeAgo(n.at)}</span> : null}
            </span>
            {n.read ? null : (
              <button
                type="button"
                disabled={read.isPending}
                onClick={() => read.mutate(n.id)}
                aria-label={`Mark "${n.title}" as read`}
                className="rounded-md border border-line px-2 text-xs text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
              >
                Mark read
              </button>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
});

/** Errors, plans and notifications at a glance, above the features and sessions. */
export const Overview = memo(function Overview() {
  return (
    <div className="grid gap-4 px-6 pb-4 lg:grid-cols-3">
      <ErrorsPanel />
      <PlansPanel />
      <NotificationsPanel />
    </div>
  );
});
