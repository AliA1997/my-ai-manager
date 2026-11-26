import { memo } from 'react';
import { anchorLabel, type ChatEntry, type HistoryRound, type QueuedPrompt } from '../../lib/session';
import { AgentHtml } from './AgentHtml';
import { useSessionContext } from './useSession';

/** A stable ref callback: it runs once for each new node, and the node below is new each time the chat grows. */
const follow = (node: HTMLDivElement | null): void => node?.scrollIntoView({ block: 'end' });

/** One message. The agent's text is drawn from a whitelist (AgentHtml); the person's is a text node (SEC-4). */
const Bubble = memo(function Bubble({ entry }: { entry: ChatEntry }) {
  if (entry.role === 'agent') {
    return (
      <div
        title={entry.at ?? undefined}
        className="mr-6 rounded-lg border border-line bg-surface p-2 text-fg"
      >
        <AgentHtml html={String(entry.html ?? '')} />
      </div>
    );
  }
  return (
    <div title={entry.at ?? undefined} className="ml-6 rounded-lg bg-accent p-2 text-accent-fg">
      {entry.anchor ? <div className="mb-1 text-xs opacity-80">{String(entry.anchor)}</div> : null}
      <div className="break-words whitespace-pre-wrap">{String(entry.text ?? '')}</div>
    </div>
  );
});

/** The conversation: earlier rounds folded away, the first-run tip while it is empty, and the newest at the end. */
export const ChatPanel = memo(function ChatPanel() {
  const s = useSessionContext();
  const rounds: HistoryRound[] = s.page.history;
  return (
    <div
      id="chat-panel"
      role="tabpanel"
      aria-labelledby="tab-chat"
      hidden={s.ui.tab !== 'chat'}
      tabIndex={0}
      className="flex-1 overflow-auto p-3 focus-visible:outline-2 focus-visible:outline-accent"
    >
      {rounds.length ? (
        <details className="mb-3">
          <summary className="cursor-pointer text-muted">Previous rounds ({rounds.length})</summary>
          {rounds.map((round, i) => (
            <div key={`${round.ended_at ?? ''}-${i}`} className="mt-2 flex flex-col gap-2">
              <p className="text-xs text-muted">
                Round {i + 1}
                {round.ended_at ? ` · ended ${new Date(round.ended_at).toLocaleString()}` : ''}
              </p>
              {round.chat.map((entry, j) => (
                <Bubble key={`${i}-${j}`} entry={entry} />
              ))}
            </div>
          ))}
        </details>
      ) : null}
      <div className="flex flex-col gap-2">
        {s.chat.length === 0 && !s.ended ? (
          <div className="rounded-lg border border-dashed border-line p-3 text-muted">
            <p className="mb-2">
              Click any part of the plan to leave a note, or select text and press Comment.
            </p>
            <p>
              Notes wait above the tabs until you press Send to Agent. Ctrl+I switches between Annotate and
              Interact; in Interact, clicks reach the page and Alt-click takes a note.
            </p>
          </div>
        ) : null}
        {s.chat.map((entry, i) => (
          <Bubble key={entry.prompt_id ?? `${entry.role}-${i}`} entry={entry} />
        ))}
        <div ref={follow} key={s.chat.length} />
      </div>
    </div>
  );
});

const QueuedItem = memo(function QueuedItem({
  item,
  disabled,
  onRemove,
}: {
  item: QueuedPrompt;
  disabled: boolean;
  onRemove: (id: string) => void;
}) {
  const anchor = anchorLabel(item);
  return (
    <div className="rounded-lg border border-dashed border-accent bg-surface p-2 text-fg">
      <div className="mb-1 flex items-center justify-between text-xs text-muted">
        <span>Queued</span>
        <button
          type="button"
          title="Remove from queue"
          aria-label="Remove from queue"
          disabled={disabled}
          onClick={() => onRemove(item.prompt_id)}
          className="rounded px-2 text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50"
        >
          ×
        </button>
      </div>
      {anchor ? <div className="mb-1 text-xs text-muted">{anchor}</div> : null}
      {item.tag === 'text' && item.text ? (
        <blockquote className="mb-1 border-l-4 border-line pl-2 text-muted">{item.text}</blockquote>
      ) : null}
      <div className="break-words whitespace-pre-wrap">{item.prompt}</div>
    </div>
  );
});

/** The notes that have not been sent yet. They show on both tabs. */
export const QueuedNotes = memo(function QueuedNotes() {
  const s = useSessionContext();
  if (!s.queue.length) return null;
  return (
    <section
      aria-label="Queued notes"
      className="flex max-h-48 flex-col gap-2 overflow-auto border-b border-line p-3"
    >
      <p className="text-sm font-medium text-fg">
        {s.queue.length} {s.queue.length === 1 ? 'note' : 'notes'} not sent yet
      </p>
      {s.queue.map((item) => (
        <QueuedItem
          key={item.prompt_id}
          item={item}
          disabled={s.ui.sending || s.ended}
          onRemove={s.removeQueued}
        />
      ))}
    </section>
  );
});
