import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { useCallback, useRef, useState, type ChangeEvent } from 'react';
import { errorLogLabel } from '../../lib/env';
import { formatDate } from '../../lib/format';
import { timeAgo } from '../../lib/home';
import {
  clip,
  loggedMessage,
  projectLabel,
  refOf,
  resolveSessionId,
  SESSION_FILTERS,
  statusMessage,
  withLogged,
} from '../../lib/logs';
import { logKey, logQuery, sessionsQuery } from '../../lib/queries';
import type { LogRow, LogState, SessionItem, Severity } from '../../lib/types';
import { action } from '../../routes/logs';
import { DataFilter, type FilterOption } from '../shared/DataFilter';
import { PageHeader } from '../shared/PageHeader';
import { StatusLine } from '../shared/StatusLine';
import { EntryRow } from './EntryRow';
import { LogEntryDialog } from './LogEntryDialog';

const route = getRouteApi('/claude');

const STAGE_OPTIONS: readonly FilterOption[] = SESSION_FILTERS;

const optionLabel = (s: SessionItem): string =>
  [clip(s.title ?? '(no prompt)', 70), projectLabel(s), s.modified_at ? timeAgo(s.modified_at) : '']
    .filter(Boolean)
    .join(' · ');

/** The transcript of one session. Split out so it can load a session id the list may not contain. */
function Transcript({ id, sessions }: { id: string; sessions: SessionItem[] }) {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(logQuery(id));
  const errorLog = errorLogLabel();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const [message, setMessage] = useState('');

  const log = useMutation({
    mutationFn: action,
    onSuccess: (saved, vars) => {
      queryClient.setQueryData<LogState>(logKey(id), (prev) =>
        prev ? withLogged(prev, refOf(vars.entry), saved) : prev,
      );
      setMessage(loggedMessage(saved, errorLog));
    },
    onError: (e) => setMessage(e.message),
  });

  const onOpen = useCallback((entry: LogRow) => {
    setSelected(entry);
    dialogRef.current?.showModal();
  }, []);
  const onCancel = useCallback(() => {
    dialogRef.current?.close();
    setSelected(null);
  }, []);
  const onSave = useCallback(
    (severity: Severity, reason: string | null) => {
      if (!selected) return;
      dialogRef.current?.close();
      setMessage('');
      log.mutate({ intent: 'log-entry', sessionId: id, entry: selected, severity, reason });
    },
    [id, log, selected],
  );
  const onPick = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) =>
      void navigate({ search: { ...search, id: event.target.value } }),
    [navigate, search],
  );
  // A new node each time the count changes, so this runs once per poll that added entries.
  const followBottom = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && data.stick && data.entries.length > 0) node.scrollIntoView({ block: 'end' });
    },
    [data.stick, data.entries.length],
  );

  const list = sessions.some((s) => s.id === id) ? sessions : [{ id } satisfies SessionItem, ...sessions];
  const current = sessions.find((s) => s.id === id);
  const project = current ? projectLabel(current) : '';
  const logged = selected ? refOf(selected) : '';
  const status = message || statusMessage(data);

  return (
    <>
      <title>{`Claude log · ${id.slice(0, 8)} · My AI Manager`}</title>
      <header className="flex flex-wrap items-end justify-between gap-4 px-6 pt-4">
        <div>
          <p className="text-xs font-medium tracking-wide text-muted uppercase">Claude session</p>
          <h2 className="font-mono text-lg font-semibold text-fg">{id}</h2>
          <p className="text-sm text-muted">
            {data.lastPromptAt
              ? `Last prompt ${formatDate(data.lastPromptAt)}`
              : current?.modified_at
                ? `Last activity ${formatDate(current.modified_at)}`
                : ''}
            {project ? <span title={current?.cwd ?? ''}>{` · ${project}`}</span> : null}
          </p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="session-select" className="text-sm font-medium text-fg">
            Recent sessions
          </label>
          <select
            id="session-select"
            value={id}
            onChange={onPick}
            className="w-full min-w-0 max-w-md rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent"
          >
            {list.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title === undefined && !s.cwd && !s.modified_at ? s.id : optionLabel(s)}
              </option>
            ))}
          </select>
        </div>
      </header>
      <p className="px-6 pt-3 text-sm text-muted">
        Click an entry to log it as an error in <code>{errorLog}</code>. You can say why before it is saved.{' '}
        <code>see-plan paths</code> shows where see-plan keeps its files.
      </p>
      <StatusLine message={status} isError={log.isError} />
      <main className="px-6 pb-12" aria-label="Transcript">
        {data.entries.map((entry) => {
          const ref = refOf(entry);
          return (
            <EntryRow
              key={entry.seq}
              entry={entry}
              logged={Boolean(ref && data.reported[ref])}
              severity={ref ? data.severities[ref] : undefined}
              saving={log.isPending && log.variables ? refOf(log.variables.entry) === ref : false}
              errorLog={errorLog}
              onOpen={onOpen}
            />
          );
        })}
        <div ref={followBottom} />
      </main>
      <LogEntryDialog
        dialogRef={dialogRef}
        entry={selected}
        saved={{
          logged: Boolean(logged && data.reported[logged]),
          severity: logged ? data.severities[logged] : undefined,
          reason: logged ? (data.reasons[logged] ?? '') : '',
        }}
        error=""
        saving={log.isPending}
        onCancel={onCancel}
        onSave={onSave}
      />
    </>
  );
}

/** The /claude page: one Claude session's transcript, newest at the bottom; a click logs an entry as an error. */
export function LogsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const { data } = useSuspenseQuery(sessionsQuery({ q: search.q, filter: search.filter }));
  const id = resolveSessionId(search.id, data.sessions);
  const errorsLink = search.project ? `/errors?project=${encodeURIComponent(search.project)}` : '/errors';
  const onFilter = useCallback(
    (next: { q: string; filter: string }) =>
      void navigate({
        search: (prev) => ({
          ...prev,
          id: undefined,
          q: next.q || undefined,
          filter: next.filter || undefined,
        }),
      }),
    [navigate],
  );

  return (
    <>
      <PageHeader title="Claude session logs" errorsHref={errorsLink} />
      <div className="px-6">
        <DataFilter
          label="Search and filter Claude sessions"
          selectLabel="Stage"
          options={STAGE_OPTIONS}
          q={search.q ?? ''}
          filter={search.filter ?? ''}
          onChange={onFilter}
        />
      </div>
      {id ? (
        <Transcript key={id} id={id} sessions={data.sessions} />
      ) : (
        <>
          <title>Claude session logs · My AI Manager</title>
          <StatusLine
            message={
              search.q || search.filter
                ? 'No Claude sessions match this search.'
                : 'No Claude sessions found in ~/.claude/projects.'
            }
          />
        </>
      )}
    </>
  );
}
