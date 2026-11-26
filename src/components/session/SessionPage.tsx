import { useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { memo, useRef, useState, type KeyboardEvent } from 'react';
import { basename } from '../../lib/format';
import { sessionPageQuery } from '../../lib/queries';
import { PageHeader } from '../shared/PageHeader';
import { ArtifactFrame } from './ArtifactFrame';
import { ChatPanel, QueuedNotes } from './ChatPanel';
import { ClaudeLogTab } from './ClaudeLogTab';
import { Composer } from './Composer';
import { ConnectionCard } from './ConnectionCard';
import { DecisionBar } from './DecisionBar';
import { FeedbackDialog } from './FeedbackDialog';
import { PanelHeader } from './PanelHeader';
import { SessionContext, useSession, useSessionContext } from './useSession';
import { NextStageNotice, WorkflowBar } from './WorkflowBar';

const route = getRouteApi('/session/$key');

const tab = (selected: boolean): string =>
  `border-b-2 px-3 py-1 focus-visible:outline-2 focus-visible:outline-accent ${
    selected ? 'border-accent font-medium text-fg' : 'border-transparent text-muted hover:text-fg'
  }`;

/** Chat and Claude log. Arrow keys, Home and End move between the two. */
const Tabs = memo(function Tabs() {
  const s = useSessionContext();
  const log = s.ui.tab === 'log';
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next =
      event.key === 'ArrowRight' || event.key === 'ArrowLeft'
        ? !log
        : event.key === 'Home'
          ? false
          : event.key === 'End'
            ? true
            : null;
    if (next === null) return;
    event.preventDefault();
    s.selectTab(next ? 'log' : 'chat');
    document.getElementById(next ? 'tab-log' : 'tab-chat')?.focus();
  };
  return (
    <div
      role="tablist"
      aria-label="Panel views"
      onKeyDown={onKeyDown}
      className="flex border-b border-line px-2"
    >
      <button
        id="tab-chat"
        type="button"
        role="tab"
        aria-selected={!log}
        aria-controls="chat-panel"
        tabIndex={log ? -1 : 0}
        onClick={() => s.selectTab('chat')}
        className={tab(!log)}
      >
        Chat
      </button>
      <button
        id="tab-log"
        type="button"
        role="tab"
        aria-selected={log}
        aria-controls="claude-log-panel"
        tabIndex={log ? 0 : -1}
        onClick={() => s.selectTab('log')}
        className={tab(log)}
      >
        Claude log
      </button>
    </div>
  );
});

/** Shown once the session has ended: resume it with its history, or start a fresh round. */
const EndedBanner = memo(function EndedBanner() {
  const s = useSessionContext();
  if (!s.ended) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-3 py-2 text-fg"
    >
      <span>{s.endedBy === 'approved' ? 'Approved ✓ Session ended' : 'Session ended'}</span>
      <button
        type="button"
        onClick={() => void s.restart('reopen')}
        className="rounded-md border border-line px-3 py-1 hover:bg-page focus-visible:outline-2 focus-visible:outline-accent"
      >
        Resume (keep history)
      </button>
      <button
        type="button"
        onClick={() => void s.restart('new-session')}
        className="rounded-md border border-line px-3 py-1 hover:bg-page focus-visible:outline-2 focus-visible:outline-accent"
      >
        Start fresh
      </button>
    </div>
  );
});

function Review({ baseUrl }: { baseUrl: string }) {
  const { key } = route.useParams();
  const { data: page } = useSuspenseQuery(sessionPageQuery(key));
  const s = useSession(page, baseUrl);
  const feedbackRef = useRef<HTMLDialogElement>(null);
  const [feedbackOpened, setFeedbackOpened] = useState(0);

  const openFeedback = (): void => {
    setFeedbackOpened(feedbackOpened + 1);
    feedbackRef.current?.showModal();
  };
  const copy = (text: string, label: string): void => {
    if (!navigator.clipboard) return s.hint('Copy is not available here; select the text and copy it.', true);
    navigator.clipboard.writeText(text).then(
      () => s.hint(`${label}.`),
      () => s.hint('Copy failed; select the text and copy it.', true),
    );
  };

  return (
    <SessionContext value={s}>
      <h1 className="sr-only">Review of {basename(page.file) || 'the artifact'}</h1>
      <div className="flex flex-col h-screen bg-page">
        <PageHeader title={`Review of ${basename(page.file) || 'the artifact'}`} showTitle={false} />
        <div className="flex flex-1 min-h-0">
          <ArtifactFrame />
          <aside
            aria-label="Review panel"
            className="flex w-96 max-w-[45vw] min-w-72 flex-col border-l border-line bg-page"
          >
            <PanelHeader />
            <ConnectionCard onViewLog={() => s.selectTab('log')} onFeedback={openFeedback} copy={copy} />
            <WorkflowBar />
            <NextStageNotice />
            <EndedBanner />
            <QueuedNotes />
            <Tabs />
            <ChatPanel />
            <ClaudeLogTab />
            <DecisionBar />
            <Composer />
          </aside>
        </div>
      </div>
      <FeedbackDialog dialogRef={feedbackRef} opened={feedbackOpened} />
    </SessionContext>
  );
}

/** The review page: the artifact on the left, the conversation and controls on the right. */
export function SessionPage() {
  const baseUrl = typeof document === 'undefined' ? '' : (document.body?.dataset.baseUrl ?? '');
  return <Review baseUrl={baseUrl} />;
}
