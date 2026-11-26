import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { Suspense, useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { findProject, resolveTab, tabsFor, TAB_CONTEXT, type TabId } from '../../lib/errors-tabs';
import { sessionHref } from '../../lib/format';
import { SESSION_FILTERS } from '../../lib/logs';
import { errorsQuery, plansQuery, projectsQuery, sessionsQuery, summaryQuery } from '../../lib/queries';
import { FILTER_VALUES, SEVERITY_TITLES } from '../../lib/severity';
import type { ErrorItem, PlanItem, ProjectView, Severity } from '../../lib/types';
import { action } from '../../routes/errors';
import { DataFilter, type FilterOption } from '../shared/DataFilter';
import { PageHeader } from '../shared/PageHeader';
import { Pager } from '../shared/Pager';
import { SkeletonRows } from '../shared/Skeleton';
import { StatusLine } from '../shared/StatusLine';
import { ErrorsTable } from './ErrorsTable';
import { PlansTable, SessionsTable } from './ListTables';
import { RateDialog } from './RateDialog';

const route = getRouteApi('/errors');

const SEVERITY_OPTIONS: readonly FilterOption[] = FILTER_VALUES.map((value) => ({
  value,
  label: SEVERITY_TITLES[value],
}));

const EMPTY: Record<TabId, string> = {
  'session-errors': 'No errors logged from sessions yet. Log one from the Claude log page.',
  'plan-errors': 'No errors logged from planning sessions yet. Log one from a plan’s Claude log.',
  plans: 'No superpowers plans in this project yet. Files in docs/superpowers/plans/ show up here.',
  sessions: 'No Claude sessions found in ~/.claude/projects.',
};

type Report = (message: string, isError: boolean) => void;

function ErrorsPanel({
  tab,
  onRate,
  report,
}: {
  tab: 'session-errors' | 'plan-errors';
  onRate: (item: ErrorItem) => void;
  report: Report;
}) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const context = TAB_CONTEXT[tab] ?? 'session';
  const { data } = useSuspenseQuery(errorsQuery(context, search));
  const summary = useQuery({ ...summaryQuery(search.project ?? ''), enabled: Boolean(search.project) });

  // The reusable filter: search by meaning plus a severity select, and a pager.
  const onFilter = useCallback(
    (next: { q: string; filter: string }) =>
      void navigate({
        search: (prev) => ({
          ...prev,
          q: next.q || undefined,
          filter: next.filter || undefined,
          page: undefined,
        }),
      }),
    [navigate],
  );
  const onPage = useCallback(
    (page: number) => void navigate({ search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }) }),
    [navigate],
  );
  const onError = useCallback((message: string) => report(message, true), [report]);

  return (
    <>
      <DataFilter
        label="Search and filter errors"
        selectLabel="Severity"
        options={SEVERITY_OPTIONS}
        counts={summary.data?.counts[context]}
        q={search.q ?? ''}
        filter={search.filter ?? ''}
        onChange={onFilter}
      />
      {data.items.length === 0 ? (
        <p className="py-6 text-muted">
          {search.q || search.filter ? 'No errors match this search.' : EMPTY[tab]}
        </p>
      ) : (
        <ErrorsTable
          items={data.items}
          total={data.total}
          plan={tab === 'plan-errors'}
          onRate={onRate}
          onError={onError}
        />
      )}
      <Pager label="Error pages" page={data.page} pages={data.pages} total={data.total} onPage={onPage} />
    </>
  );
}

function PlansPanel({ project, report }: { project: ProjectView; report: Report }) {
  const { data } = useSuspenseQuery(plansQuery(project.key));
  const open = useMutation({
    mutationFn: action,
    onSuccess: ({ key }) => {
      if (key) location.assign(sessionHref(key)); // a full page load: the review session is a server page
    },
    onError: (e) => report(`Could not open the plan: ${e.message}`, true),
  });
  const onOpen = useCallback(
    (plan: PlanItem) => open.mutate({ intent: 'open-plan', project: project.key, name: plan.name }),
    [open, project.key],
  );
  if (data.items.length === 0) return <p className="py-6 text-muted">{EMPTY.plans}</p>;
  return <PlansTable items={data.items} onOpen={onOpen} busy={open.isPending} />;
}

const STAGE_OPTIONS: readonly FilterOption[] = SESSION_FILTERS;

function SessionsPanel() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const { data } = useSuspenseQuery(sessionsQuery({ q: search.q, filter: search.filter }));
  const onFilter = useCallback(
    (next: { q: string; filter: string }) =>
      void navigate({
        search: (prev) => ({ ...prev, q: next.q || undefined, filter: next.filter || undefined }),
      }),
    [navigate],
  );
  const narrowed = Boolean(search.q || search.filter);
  return (
    <>
      <DataFilter
        label="Search and filter sessions"
        selectLabel="Stage"
        options={STAGE_OPTIONS}
        q={search.q ?? ''}
        filter={search.filter ?? ''}
        onChange={onFilter}
      />
      {data.sessions.length === 0 ? (
        <p className="py-6 text-muted">{narrowed ? 'No sessions match this search.' : EMPTY.sessions}</p>
      ) : (
        <SessionsTable items={data.sessions} />
      )}
    </>
  );
}

function Scope({
  project,
  recent,
  unknown,
}: {
  project: ProjectView | null;
  recent: readonly ProjectView[];
  unknown: boolean;
}) {
  if (project) {
    return (
      <p className="px-6 pt-3 text-muted">
        Project:{' '}
        <strong title={project.root} className="text-fg">
          {project.name}
        </strong>
      </p>
    );
  }
  return (
    <div className="px-6 pt-3 text-muted">
      {unknown ? (
        <p>
          That project isn&apos;t registered; run <code>see error-logs</code> in it.
        </p>
      ) : null}
      <p>
        Not in a project folder, so only recent sessions are shown. Run <code>see error-logs</code> in a
        project folder for error logs and plans.
      </p>
      {recent.length ? (
        <p>
          Recent projects:{' '}
          {recent.map((p, i) => (
            <span key={p.key}>
              {i ? ' · ' : ''}
              <a
                href={`/errors?project=${encodeURIComponent(p.key)}`}
                title={p.root}
                className="text-link underline"
              >
                {p.name}
              </a>
            </span>
          ))}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The tabbed error-log view at /errors. With a project (D10): session errors, plan errors, the project's
 * superpowers plans and recent Claude sessions. Without one (D13): only the Sessions tab.
 */
export function ErrorsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const { data: projectList } = useSuspenseQuery(projectsQuery());
  const project = findProject(projectList.projects, search.project);
  const tabs = tabsFor(project);
  const active = resolveTab(search.tab, project);
  const summary = useQuery({ ...summaryQuery(project?.key ?? ''), enabled: Boolean(project) });
  const sessionCount = useQuery({
    ...sessionsQuery({ q: search.q, filter: search.filter }),
    enabled: active === 'sessions',
  }).data?.sessions.length;

  const [status, setStatus] = useState({ text: '', isError: false });
  const report = useCallback<Report>((text, isError) => setStatus({ text, isError }), []);

  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const select = (id: TabId) =>
    void navigate({
      search: (prev) => ({ ...prev, tab: id, q: undefined, filter: undefined, page: undefined }),
    });
  const onTabKey = (event: KeyboardEvent, i: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight'
        ? (i + 1) % tabs.length
        : event.key === 'ArrowLeft'
          ? (i - 1 + tabs.length) % tabs.length
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null;
    const id = next === null ? undefined : tabs[next]?.id;
    if (next === null || !id) return;
    event.preventDefault();
    select(id);
    tabRefs.current[next]?.focus();
  };

  // ---- one-time rating of unrated records (D6) ----
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [rating, setRating] = useState<ErrorItem | null>(null);
  const rate = useMutation({
    mutationFn: action,
    onSuccess: async () => {
      dialogRef.current?.close();
      report('Rated.', false);
      await queryClient.invalidateQueries({ queryKey: ['errors'] });
    },
  });
  const onRate = useCallback(
    (item: ErrorItem) => {
      rate.reset();
      setRating(item);
      dialogRef.current?.showModal();
    },
    [rate],
  );
  const onSave = (severity: Severity, reason: string | null) => {
    if (!rating) return;
    rate.mutate({
      intent: 'rate',
      claude_session_id: rating.claude_session_id,
      uuid: rating.uuid,
      part: rating.part,
      severity,
      reason: rating.reason ? null : reason,
    });
  };

  const count = (id: TabId): string => {
    const n =
      id === 'session-errors'
        ? summary.data?.counts.session.all
        : id === 'plan-errors'
          ? summary.data?.counts.plan.all
          : id === 'plans'
            ? summary.data?.plans
            : sessionCount;
    return typeof n === 'number' ? `(${n})` : '';
  };

  const title = project ? 'Error logs' : 'Recent sessions';
  const asked = Boolean(search.project);
  const claudeHref = `/claude${project ? `?project=${encodeURIComponent(project.key)}` : ''}`;

  return (
    <>
      <title>
        {project ? `Error logs · ${project.name} · My AI Manager` : 'Recent sessions · My AI Manager'}
      </title>
      <PageHeader title={title} claudeHref={claudeHref} />
      <Scope
        project={project}
        recent={project ? [] : projectList.projects.slice(0, 5)}
        unknown={asked && !project}
      />
      <StatusLine message={status.text} isError={status.isError} />
      <main className="px-6 pb-12">
        <div
          role="tablist"
          aria-label={project ? 'Error log views' : 'Sessions'}
          className="flex flex-wrap gap-1 border-b border-line"
        >
          {tabs.map((t, i) => (
            <button
              key={t.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-controls={`panel-${t.id}`}
              aria-selected={t.id === active}
              tabIndex={t.id === active ? 0 : -1}
              onClick={() => select(t.id)}
              onKeyDown={(event) => onTabKey(event, i)}
              className={`border-b-2 px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-accent ${t.id === active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg'}`}
            >
              {t.title} <span className="text-xs">{count(t.id)}</span>
            </button>
          ))}
        </div>
        {tabs.map((t) => (
          <section
            key={t.id}
            role="tabpanel"
            id={`panel-${t.id}`}
            aria-labelledby={`tab-${t.id}`}
            tabIndex={0}
            hidden={t.id !== active}
            className="focus-visible:outline-2 focus-visible:outline-accent"
          >
            <h2 className="sr-only">{t.title}</h2>
            {t.id === active ? (
              <Suspense fallback={<SkeletonRows label={`Loading ${t.title}`} />}>
                {t.id === 'plans' && project ? <PlansPanel project={project} report={report} /> : null}
                {t.id === 'sessions' ? <SessionsPanel /> : null}
                {t.id === 'session-errors' || t.id === 'plan-errors' ? (
                  <ErrorsPanel tab={t.id} onRate={onRate} report={report} />
                ) : null}
              </Suspense>
            ) : null}
          </section>
        ))}
      </main>
      <RateDialog
        dialogRef={dialogRef}
        item={rating}
        error={rate.error?.message ?? ''}
        saving={rate.isPending}
        onCancel={() => setRating(null)}
        onSave={onSave}
      />
    </>
  );
}
