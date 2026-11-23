import { memo } from 'react';
import { basename, claudeHref, formatDate, formatDay, sessionHref } from '../../lib/format';
import type { PlanItem, SessionItem } from '../../lib/types';
import { SeverityBadge } from './SeverityBadge';
import { td, th } from './ErrorsTable';

const link = 'text-link underline-offset-2 hover:underline';

const ErrorsCell = memo(function ErrorsCell({
  count,
  worst,
}: {
  count?: number | undefined;
  worst?: string | null | undefined;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span>{count ?? 0}</span>
      {count ? <SeverityBadge severity={worst} /> : null}
    </span>
  );
});

type PlansProps = { items: readonly PlanItem[]; onOpen: (plan: PlanItem) => void; busy: boolean };

/** The project's superpowers plans, newest first. A plan without a review session can be opened. */
export const PlansTable = memo(function PlansTable({ items, onOpen, busy }: PlansProps) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Plan', 'Created', 'Status', 'Errors'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
              <th scope="col" className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((p) => (
              <tr key={p.name}>
                <td className={td}>
                  {p.review_key ? (
                    <a href={sessionHref(p.review_key)} title={p.file} className={link}>
                      {p.title || p.name}
                    </a>
                  ) : (
                    <span className="font-medium">{p.title || p.name}</span>
                  )}
                  {p.title ? <div className="text-xs text-muted">{p.name}</div> : null}
                </td>
                <td className={td}>{formatDay(p.created_at)}</td>
                <td className={td}>{p.status}</td>
                <td className={td}>
                  <ErrorsCell count={p.error_count} worst={p.worst_severity} />
                </td>
                <td className={td}>
                  {p.review_key ? null : (
                    <button
                      type="button"
                      disabled={busy}
                      aria-label={`Open ${p.name} in Claude Manager`}
                      onClick={() => onOpen(p)}
                      className="rounded-md border border-line px-2 py-0.5 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
                    >
                      Open
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="py-2 text-xs text-muted">
        The {items.length} most recently created plans in docs/superpowers/plans/.
      </p>
    </>
  );
});

const projectLabel = (s: SessionItem): string => basename(s.cwd) || String(s.project ?? '');

/** The most recent Claude sessions, with the review session and stage each one belongs to. */
export const SessionsTable = memo(function SessionsTable({ items }: { items: readonly SessionItem[] }) {
  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {['Session', 'Project', 'Last activity', 'Review session / stage', 'Errors'].map((h) => (
                <th key={h} scope="col" className={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((s) => (
              <tr key={s.id}>
                <td className={td}>
                  <a href={claudeHref(s.id)} title={s.id} className={link}>
                    {s.title || s.id.slice(0, 8)}
                  </a>
                </td>
                <td className={td}>{projectLabel(s)}</td>
                <td className={td}>{formatDate(s.modified_at)}</td>
                <td className={td}>
                  {s.review_key ? (
                    <span>
                      <a href={sessionHref(s.review_key)} className={link}>
                        {s.review_key.slice(0, 8)}
                      </a>
                      {s.stage ? <span className="text-muted"> · {s.stage}</span> : null}
                    </span>
                  ) : (
                    <span className="text-muted">—</span>
                  )}
                </td>
                <td className={td}>
                  <ErrorsCell count={s.error_count} worst={s.worst_severity} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="py-2 text-xs text-muted">The {items.length} most recent Claude sessions.</p>
    </>
  );
});
