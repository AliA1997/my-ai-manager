import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { useCallback, useMemo, useRef } from 'react';
import { defaultDir, sortWorkflows, splitSessions } from '../../lib/home';
import { useHomePush } from '../../lib/home-socket';
import { homeQuery } from '../../lib/queries';
import { action } from '../../routes/home';
import { PageHeader } from '../shared/PageHeader';
import { StatusLine } from '../shared/StatusLine';
import { AgentStrip } from './AgentStrip';
import { ConnectClaudeDialog } from './ConnectClaudeDialog';
import { FeatureCard } from './FeatureCard';
import { Overview } from './Overview';
import { NewFeatureDialog } from './NewFeatureDialog';
import { SessionCard } from './SessionCard';

/** The dashboard at `/`: features with their stage tracker (left), finished sessions (middle), open sessions (right). */
export function HomePage() {
  const queryClient = useQueryClient();
  const { data: loaded } = useSuspenseQuery(homeQuery());
  const pushed = useHomePush(); // live updates win over the loader's data
  const data = pushed ?? loaded;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const connectRef = useRef<HTMLDialogElement>(null);

  const archive = useMutation({
    mutationFn: action,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['home'] }),
  });
  const create = useMutation({
    mutationFn: action,
    onSuccess: (result) => {
      if (result.url) window.location.assign(result.url);
    },
  });

  const workflows = useMemo(() => sortWorkflows(data.workflows), [data.workflows]);
  const { live, done } = useMemo(() => splitSessions(data.sessions), [data.sessions]);
  const byKey = useMemo(() => new Map(data.sessions.map((s) => [s.key, s])), [data.sessions]);
  const initialDir = useMemo(() => defaultDir(data), [data]);

  const onArchive = useCallback((key: string) => archive.mutate({ intent: 'archive', key }), [archive]);
  const onOpen = useCallback(() => {
    create.reset();
    dialogRef.current?.showModal();
  }, [create]);
  const onCancel = useCallback(() => dialogRef.current?.close(), []);
  const onCreate = useCallback(
    (input: { name: string; dir: string; requirements: string; startClaude: boolean }) =>
      create.mutate({ intent: 'create-feature', ...input }),
    [create],
  );

  const agentConnected = data.sessions.some((s) => s.status !== 'ended' && Boolean(s.agent));
  const message = archive.error?.message ?? (archive.isSuccess ? 'Archived.' : '');

  return (
    <>
      <title>Claude Manager</title>
      <PageHeader
        title="Claude Manager"
        links={
          <>
            <button
              type="button"
              onClick={onOpen}
              className="rounded-md bg-accent px-3 py-1 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              + New feature
            </button>
          </>
        }
      />
      <StatusLine message={message} isError={Boolean(archive.error)} />
      <AgentStrip connected={agentConnected} onConnect={() => connectRef.current?.showModal()} />
      <Overview />
      <div className="grid gap-6 px-6 pb-12 lg:grid-cols-[2fr_1fr_1fr]">
        <main aria-labelledby="features-title" className="flex flex-col gap-3">
          <h2 id="features-title" className="text-lg font-semibold text-fg">
            Features
          </h2>
          <p className="text-muted">
            Each feature runs four stages, each with its own Claude session: Plan → Interrogation →
            Implementation → Verification. A stage opens when the one before it is approved or skipped.
          </p>
          {workflows.length === 0 ? (
            <p className="text-muted">
              No features yet. Press New feature to start one from your requirements.
            </p>
          ) : (
            workflows.map((wf) => <FeatureCard key={wf.id} workflow={wf} sessions={byKey} />)
          )}
        </main>
        <aside aria-labelledby="history-title" className="flex flex-col gap-3">
          <h2 id="history-title" className="text-lg font-semibold text-fg">
            History {done.length ? <span className="text-muted">{done.length}</span> : null}
          </h2>
          <p className="text-muted">Finished sessions, newest first. Open one to read it or resume it.</p>
          {done.length === 0 ? <p className="text-muted">Nothing finished yet.</p> : null}
          {done.map((s) => (
            <SessionCard
              key={s.key}
              session={s}
              workflows={workflows}
              history
              busy={false}
              onArchive={onArchive}
            />
          ))}
        </aside>
        <aside aria-labelledby="sessions-title" className="flex flex-col gap-3">
          <h2 id="sessions-title" className="text-lg font-semibold text-fg">
            Sessions {live.length ? <span className="text-muted">{live.length}</span> : null}
          </h2>
          <p className="text-muted">Everything open now, including each feature&apos;s stages.</p>
          {live.length === 0 ? (
            <p className="text-muted">Nothing open. Ask your agent to run see-plan &lt;file&gt;.</p>
          ) : null}
          {live.map((s) => (
            <SessionCard
              key={s.key}
              session={s}
              workflows={workflows}
              history={false}
              busy={archive.isPending}
              onArchive={onArchive}
            />
          ))}
        </aside>
      </div>
      {agentConnected ? null : <ConnectClaudeDialog dialogRef={connectRef} />}
      <NewFeatureDialog
        dialogRef={dialogRef}
        initialDir={initialDir}
        error={create.error?.message ?? ''}
        saving={create.isPending}
        onCancel={onCancel}
        onCreate={onCreate}
      />
    </>
  );
}
