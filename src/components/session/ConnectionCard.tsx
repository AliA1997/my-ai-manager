import { memo } from 'react';
import { ALLOW_RULE, clock } from '../../lib/session';
import { useSessionContext } from './useSession';

const button =
  'rounded-md border border-line px-3 py-1 text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';
const primary = `${button} bg-accent font-medium text-accent-fg! hover:opacity-90`;

const dot: Record<string, string> = {
  connected: 'bg-green-600',
  working: 'bg-accent',
  stuck: 'bg-danger',
};

/** Who is connected to the review, how to connect one, and the ways to copy what the agent needs. */
export const ConnectionCard = memo(function ConnectionCard({
  onViewLog,
  onFeedback,
  copy,
}: {
  onViewLog: () => void;
  onFeedback: () => void;
  copy: (text: string, label: string) => void;
}) {
  const s = useSessionContext();
  const { state, text, buttons, launch, now } = s.connection;
  if (s.ended) return null;
  const poll = s.page.poll_command || 'see poll <file>';
  const lastPoll = s.presence.last_poll_at;
  const title =
    lastPoll && (state === 'connected' || state === 'working')
      ? `Last check-in ${clock(now - Date.parse(lastPoll))} ago`
      : undefined;
  const connectLabel = state === 'unsupported' ? 'Get the command' : 'Connect Claude';
  return (
    <section
      aria-label="Agent connection"
      data-state={state}
      className="flex flex-col gap-2 border-b border-line p-3"
    >
      <p role="status" aria-live="polite" title={title} className="flex items-start gap-2 text-fg">
        <span
          aria-hidden="true"
          className={`mt-1.5 size-2.5 shrink-0 rounded-full ${dot[state] ?? 'bg-muted'}`}
        />
        <span>{text}</span>
      </p>
      <div className="flex flex-wrap gap-2">
        {buttons.connect ? (
          <button type="button" onClick={() => void s.connect(false)} className={primary}>
            {connectLabel}
          </button>
        ) : null}
        {buttons.resume ? (
          <button type="button" onClick={() => void s.connect(true)} className={button}>
            Resume last session
          </button>
        ) : null}
        {buttons.cancel ? (
          <button type="button" onClick={() => void s.cancelConnect()} className={button}>
            Cancel
          </button>
        ) : null}
        {buttons.retry ? (
          <button
            type="button"
            onClick={() => void s.cancelConnect().then(() => s.connect(false))}
            className={button}
          >
            Try again
          </button>
        ) : null}
        {buttons.copyAllow ? (
          <button
            type="button"
            onClick={() => copy(ALLOW_RULE, 'Copied. Add it to permissions.allow in .claude/settings.json')}
            className={button}
          >
            Copy allow-rule
          </button>
        ) : null}
        {buttons.copyCommand ? (
          <button
            type="button"
            onClick={() => copy(launch?.command || poll, 'Command copied')}
            className={button}
          >
            Copy command
          </button>
        ) : null}
        {buttons.viewLog ? (
          <button type="button" onClick={onViewLog} className={button}>
            View log
          </button>
        ) : null}
        <button type="button" onClick={onFeedback} className={button}>
          Session feedback
        </button>
      </div>
      {buttons.showCommand ? (
        <pre className="overflow-auto rounded-md bg-page p-2 text-xs whitespace-pre-wrap">
          {launch?.command}
        </pre>
      ) : null}
      {buttons.manual ? (
        <details>
          <summary className="cursor-pointer text-muted">How do I connect manually?</summary>
          <p className="my-1 text-muted">
            Ask your agent to run this in the project folder, and to run it again each time it returns:
          </p>
          <code className="mr-2 text-xs break-all">{poll}</code>
          <button type="button" onClick={() => copy(poll, 'Poll command copied')} className={button}>
            Copy
          </button>
        </details>
      ) : null}
    </section>
  );
});
