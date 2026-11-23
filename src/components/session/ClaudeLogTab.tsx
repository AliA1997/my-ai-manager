import { useQuery, useQueryClient } from '@tanstack/react-query';
import { memo, useCallback, useRef, useState, type FormEvent } from 'react';
import { errorLogLabel } from '../../lib/env';
import { refOf, projectLabel, withLogged } from '../../lib/logs';
import { logKey, sessionLogKey, sessionLogQuery, sessionsQuery } from '../../lib/queries';
import { LOG_TAG, newPromptId, timeAgo, type QueuedPrompt } from '../../lib/session';
import { SEVERITY_TITLES } from '../../lib/severity';
import type { LogRow, LogState, Severity } from '../../lib/types';
import { action as logAction } from '../../routes/logs';
import { EntryRow } from '../logs/EntryRow';
import { LogNoteDialog, type NoteChoice } from './LogNoteDialog';
import { useSessionContext } from './useSession';

const button =
  'rounded-md border border-line px-3 py-1 text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-50';

function Picker({ onAttached }: { onAttached: () => void }) {
  const s = useSessionContext();
  const { data, isError } = useQuery(sessionsQuery());
  const [typed, setTyped] = useState('');
  const [message, setMessage] = useState('');

  const attach = async (id: string): Promise<void> => {
    if (!id) return;
    try {
      await s.run({ intent: 'attach-claude', key: s.key, id });
      setTyped('');
      s.push({ type: 'claude-session', id });
      onAttached();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Could not reach see-plan.');
    }
  };
  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void attach(typed.trim());
  };
  const list = data?.sessions ?? [];

  return (
    <div className="flex flex-col gap-2 border-b border-line p-3">
      <p className="font-medium text-fg">Recent Claude sessions</p>
      <div className="flex max-h-56 flex-col gap-1 overflow-auto">
        {isError ? <p className="text-muted">Could not load Claude sessions.</p> : null}
        {!data && !isError ? <p className="text-muted">Loading…</p> : null}
        {data && list.length === 0 ? (
          <p className="text-muted">No Claude sessions found in ~/.claude/projects.</p>
        ) : null}
        {list.map((c) => (
          <button
            key={c.id}
            type="button"
            title={`${c.id}${c.cwd ? `\n${c.cwd}` : ''}`}
            onClick={() => void attach(c.id)}
            className={`flex flex-col rounded-md border px-2 py-1 text-left hover:bg-page focus-visible:outline-2 focus-visible:outline-accent ${
              c.id === s.claudeSessionId ? 'border-accent' : 'border-line'
            }`}
          >
            <span className="text-fg">{c.title ?? '(no prompt)'}</span>
            <span className="text-xs text-muted">
              {[projectLabel(c), c.modified_at ? timeAgo(c.modified_at) : '', c.id.slice(0, 8)]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit} className="flex gap-2">
        <label htmlFor="claude-session-input" className="sr-only">
          Claude session id
        </label>
        <input
          id="claude-session-input"
          type="text"
          value={typed}
          autoComplete="off"
          spellCheck={false}
          placeholder="Or paste a Claude session id"
          onChange={(e) => setTyped(e.target.value)}
          className="min-w-0 flex-1 rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent"
        />
        <button type="submit" className={button}>
          Attach
        </button>
      </form>
      <p role="status" aria-live="polite" className="text-danger">
        {message}
      </p>
    </div>
  );
}

/** The transcript of the attached Claude session: click an entry to note it to the agent, log it, or both. */
export const ClaudeLogTab = memo(function ClaudeLogTab() {
  const s = useSessionContext();
  const queryClient = useQueryClient();
  const id = s.claudeSessionId;
  const visible = s.ui.tab === 'log';
  const { data } = useQuery({ ...sessionLogQuery(s.key, id), enabled: visible && id !== '' });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selected, setSelected] = useState<LogRow | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const errorLog = errorLogLabel();

  const onOpen = useCallback((entry: LogRow) => {
    setSelected(entry);
    dialogRef.current?.showModal();
  }, []);
  const onCancel = useCallback(() => {
    dialogRef.current?.close();
    setSelected(null);
  }, []);
  // A new node each time the count changes, so this runs once per poll that added entries.
  const followBottom = useCallback(
    (node: HTMLDivElement | null) => {
      if (node && data?.stick && data.entries.length > 0 && !pickerOpen)
        node.scrollIntoView({ block: 'end' });
    },
    [data?.stick, data?.entries.length, pickerOpen],
  );

  const record = (entry: LogRow) => ({
    claude_session_id: id,
    uuid: typeof entry.uuid === 'string' ? entry.uuid : null,
    part: Number(entry.part) || 0,
    role: String(entry.role ?? ''),
    kind: String(entry.kind ?? ''),
    at: entry.at ? String(entry.at) : null,
    text: String(entry.text ?? ''),
  });

  const onChoose = async (choice: NoteChoice, severity: Severity | null, note: string): Promise<void> => {
    const entry = selected;
    if (!entry) return;
    onCancel();
    let duplicate = false;
    if (choice.asError && severity) {
      try {
        const saved = await logAction({
          intent: 'log-entry',
          sessionId: id,
          entry,
          severity,
          reason: note || null,
        });
        duplicate = saved.duplicate;
        queryClient.setQueryData<LogState>(sessionLogKey(s.key, id), (prev) =>
          prev ? withLogged(prev, refOf(entry), saved) : prev,
        );
        queryClient.setQueryData<LogState>(logKey(id), (prev) =>
          prev ? withLogged(prev, refOf(entry), saved) : prev,
        );
      } catch (e) {
        return s.hint(e instanceof Error ? e.message : String(e), true);
      }
    }
    if (!choice.toAgent) {
      return s.hint(
        duplicate
          ? `Already in ${errorLog}; the first reason and severity were kept.`
          : `Logged to ${errorLog} as ${severity ? SEVERITY_TITLES[severity] : ''}.`,
      );
    }
    const ref = refOf(entry);
    const prompt: QueuedPrompt = {
      prompt_id: ref ? `${LOG_TAG}:${ref}` : newPromptId(),
      prompt: note || 'Look at this Claude log entry.',
      tag: LOG_TAG,
      selector: '',
      text: '',
      target: {
        entry: record(entry),
        note,
        logged_as_error: choice.asError,
        error_log: choice.asError ? errorLog : null,
      },
    };
    await s.sendEntry(prompt);
  };

  const missing = id !== '' && data !== undefined && !data.found;
  const showList = id === '' || pickerOpen || missing;
  const status =
    id === ''
      ? 'No Claude session is attached yet. Pick a recent one, use Connect Claude, or paste a session id.'
      : !data
        ? `Waiting for Claude's log for session ${id}…`
        : missing
          ? `Waiting for Claude's log for session ${id}… Or pick another session below.`
          : data.omitted
            ? 'Earlier entries omitted'
            : data.entries.length
              ? ''
              : 'Claude has not written anything yet.';
  const selectedRef = selected ? refOf(selected) : '';

  return (
    <div
      id="claude-log-panel"
      role="tabpanel"
      aria-labelledby="tab-log"
      hidden={!visible}
      className="flex-1 overflow-auto"
    >
      {id ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
          <span title={id} className="text-fg">
            Session {id.slice(0, 8)}
          </span>
          {pickerOpen || !missing ? (
            <button type="button" onClick={() => setPickerOpen(!pickerOpen)} className={button}>
              {pickerOpen ? 'Close list' : 'Change session'}
            </button>
          ) : null}
          <p className="w-full text-xs text-muted">
            Click an entry to add a note, send it to the agent, or log it as an error.
          </p>
        </div>
      ) : null}
      <p role="status" aria-live="polite" className="min-h-6 px-3 pt-2 text-muted">
        {status}
      </p>
      {showList ? <Picker onAttached={() => setPickerOpen(false)} /> : null}
      <div className="px-3 pb-3">
        {data?.entries.map((entry) => {
          const ref = refOf(entry);
          return (
            <EntryRow
              key={entry.seq}
              entry={entry}
              logged={Boolean(ref && data.reported[ref])}
              severity={ref ? data.severities[ref] : undefined}
              saving={false}
              errorLog={errorLog}
              note
              sent={Boolean(ref && s.sentLogRefs.has(`${LOG_TAG}:${ref}`))}
              onOpen={onOpen}
            />
          );
        })}
        <div ref={followBottom} />
      </div>
      <LogNoteDialog
        dialogRef={dialogRef}
        entry={selected}
        alreadySent={Boolean(selectedRef && s.sentLogRefs.has(`${LOG_TAG}:${selectedRef}`))}
        ended={s.ended}
        onCancel={onCancel}
        onChoose={(choice, severity, note) => void onChoose(choice, severity, note)}
      />
    </div>
  );
});
