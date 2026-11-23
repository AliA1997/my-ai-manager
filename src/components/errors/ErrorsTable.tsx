import { memo, useState } from 'react';
import { getJson, queryString } from '../../lib/api';
import { basename, claudeHref, formatDate, sessionHref } from '../../lib/format';
import { isSeverity } from '../../lib/severity';
import type { ErrorItem } from '../../lib/types';
import { SeverityBadge } from './SeverityBadge';

export const th = 'border-b border-line px-3 py-2 text-left text-xs font-semibold text-muted uppercase';
export const td = 'border-b border-line px-3 py-2 align-top';
const link = 'text-link underline-offset-2 hover:underline';

function describe(item: ErrorItem): string {
  const who = item.role === 'assistant' ? 'Claude' : 'User';
  const kind = item.kind === 'tool_use' ? 'tool call' : item.kind === 'tool_result' ? 'tool result' : '';
  return [who, kind].filter(Boolean).join(' · ');
}

const ErrorRow = memo(function ErrorRow({
  item,
  plan,
  onRate,
  onError,
}: {
  item: ErrorItem;
  plan: boolean;
  onRate: (item: ErrorItem) => void;
  onError: (message: string) => void;
}) {
  // The preview is cut on the server; "Show all" fetches the whole record on demand.
  const [full, setFull] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const showAll = async () => {
    setLoading(true);
    try {
      const query = queryString({
        claude_session_id: item.claude_session_id,
        uuid: item.uuid,
        part: item.part,
      });
      const body = await getJson<{ record: { text: string } }>(`/api/errors/record${query}`);
      setFull(body.record.text);
    } catch (e) {
      onError(`Could not load the full text: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <tr
      className={item.severity === 'send_to_it' ? 'shadow-[inset_4px_0_0_var(--color-sev-send-to-it)]' : ''}
    >
      <td className={td}>
        <SeverityBadge severity={item.severity} />
        {isSeverity(item.severity) ? null : (
          <>
            {' '}
            <button
              type="button"
              onClick={() => onRate(item)}
              className="rounded-md border border-line px-2 py-0.5 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
            >
              Rate…
            </button>
          </>
        )}
      </td>
      <td className={`${td} max-w-xl`}>
        <div className="text-xs text-muted">{describe(item)}</div>
        <div className="break-words whitespace-pre-wrap">
          {full ?? `${item.text}${item.truncated ? '…' : ''}`}
        </div>
        {item.truncated && full === null ? (
          <button
            type="button"
            aria-expanded="false"
            disabled={loading}
            onClick={() => void showAll()}
            className={`${link} focus-visible:outline-2 focus-visible:outline-accent`}
          >
            Show all
          </button>
        ) : null}
      </td>
      <td className={td}>
        {item.reason ? item.reason : <span className="text-muted">No reason given</span>}
      </td>
      <td className={td}>
        <a href={claudeHref(item.claude_session_id)} title={item.claude_session_id} className={link}>
          {item.claude_title || item.claude_session_id.slice(0, 8)}
        </a>
      </td>
      {plan ? (
        <td className={td}>
          {item.review_key && item.file ? (
            <a href={sessionHref(item.review_key)} title={item.file} className={link}>
              {basename(item.file)}
            </a>
          ) : (
            <span className="text-muted">—</span>
          )}
        </td>
      ) : null}
      <td className={td}>{formatDate(item.reported_at)}</td>
    </tr>
  );
});

type Props = {
  items: readonly ErrorItem[];
  total: number;
  plan: boolean;
  onRate: (item: ErrorItem) => void;
  onError: (message: string) => void;
};

/** The error rows of one tab. Severity is text, and an unrated row offers a one-time rating. */
export const ErrorsTable = memo(function ErrorsTable({ items, total, plan, onRate, onError }: Props) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th scope="col" className={th}>
                Severity
              </th>
              <th scope="col" className={th}>
                Error
              </th>
              <th scope="col" className={th}>
                Reason
              </th>
              <th scope="col" className={th}>
                Session
              </th>
              {plan ? (
                <th scope="col" className={th}>
                  Plan/file
                </th>
              ) : null}
              <th scope="col" className={th}>
                Logged
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <ErrorRow
                key={`${item.claude_session_id}:${item.uuid}:${item.part}`}
                item={item}
                plan={plan}
                onRate={onRate}
                onError={onError}
              />
            ))}
          </tbody>
        </table>
      </div>
      <p className="py-2 text-xs text-muted">
        Showing {items.length} of {total}.
      </p>
    </>
  );
});
