import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { getRouteApi } from '@tanstack/react-router';
import { memo, useCallback, useId, useMemo, useState, type FormEvent } from 'react';
import { dataConfigQuery, notificationsQuery } from '../../lib/queries';
import { action } from '../../routes/notifications';
import type { DeletionRule, NotificationItem } from '../../lib/types';
import { formatDate } from '../../lib/format';
import { DataFilter, type FilterOption } from '../shared/DataFilter';
import { PageHeader } from '../shared/PageHeader';
import { Pager } from '../shared/Pager';
import { StatusLine } from '../shared/StatusLine';

const route = getRouteApi('/notifications');

export const KIND_TITLES: Record<string, string> = {
  error: 'New error',
  deleted: 'Deleted',
  'pending-download': 'Waiting for download',
  size: 'Size warning',
};

const KIND_OPTIONS: readonly FilterOption[] = Object.entries(KIND_TITLES).map(([value, label]) => ({
  value,
  label,
}));

const field =
  'rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent';

const NotificationRow = memo(function NotificationRow({
  item,
  onRead,
  busy,
}: {
  item: NotificationItem;
  onRead: (id: string) => void;
  busy: boolean;
}) {
  return (
    <li
      className={`border-b border-line py-3 ${item.read ? 'text-muted' : 'border-l-4 border-l-accent pl-3 text-fg'}`}
    >
      <strong className="font-semibold">{item.title}</strong>{' '}
      <span className="text-xs text-muted">{KIND_TITLES[item.kind] ?? item.kind}</span>
      <p>{item.message}</p>
      <time className="text-xs text-muted">{formatDate(item.at)}</time>
      {item.kind === 'pending-download' && item.domain ? (
        <>
          {' '}
          <a
            href={`/api/data/${encodeURIComponent(item.domain)}/export`}
            className="text-link underline-offset-2 hover:underline"
          >
            Download {item.domain} and delete them
          </a>
        </>
      ) : null}
      {item.read ? null : (
        <>
          {' '}
          <button
            type="button"
            disabled={busy}
            onClick={() => onRead(item.id)}
            className="rounded-md border border-line px-2 py-0.5 text-fg hover:bg-surface focus-visible:outline-2 focus-visible:outline-accent"
          >
            Mark as read
          </button>
        </>
      )}
    </li>
  );
});

function SettingsForm({ rule, dir, onSaved }: { rule: DeletionRule; dir: string; onSaved: () => void }) {
  const id = useId();
  const [type, setType] = useState(rule.type);
  const [threshold, setThreshold] = useState(String(rule.threshold));
  const [deleteCount, setDeleteCount] = useState(String(rule.deleteCount ?? ''));
  const save = useMutation({ mutationFn: action, onSuccess: onSaved });

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({
      intent: 'save-settings',
      rule: {
        type,
        threshold: Number(threshold),
        ...(Number(deleteCount) ? { deleteCount: Number(deleteCount) } : {}),
      },
    });
  };

  return (
    <section aria-labelledby={`${id}-title`} className="mt-8 border-t border-line pt-6">
      <h2 id={`${id}-title`} className="mb-2 text-lg font-semibold text-fg">
        Data settings
      </h2>
      <p className="mb-4 text-muted">
        Data lives in <code>{dir}</code>. These settings are read from <code>config.json</code> there.
      </p>
      <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-type`} className="font-medium text-fg">
            When a data set reaches the threshold
          </label>
          <select id={`${id}-type`} value={type} onChange={(e) => setType(e.target.value)} className={field}>
            <option value="download-then-delete">Wait for a download, then delete</option>
            <option value="delete-oldest">Delete the oldest records, no download</option>
            <option value="notify-only">Delete nothing, only notify me</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-threshold`} className="font-medium text-fg">
            Threshold (records)
          </label>
          <input
            id={`${id}-threshold`}
            type="number"
            min={1}
            max={10000000}
            step={1}
            required
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            className={field}
          />
        </div>
        {type === 'delete-oldest' ? (
          <div className="flex flex-col gap-1">
            <label htmlFor={`${id}-count`} className="font-medium text-fg">
              Delete this many at a time
            </label>
            <input
              id={`${id}-count`}
              type="number"
              min={1}
              step={1}
              value={deleteCount}
              onChange={(e) => setDeleteCount(e.target.value)}
              className={field}
            />
          </div>
        ) : null}
        <p role="alert" className="min-h-6 text-danger">
          {save.error?.message ?? ''}
        </p>
        <button
          type="submit"
          disabled={save.isPending}
          className="self-start rounded-md bg-accent px-4 py-2 font-medium text-black hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:opacity-50"
        >
          Save settings
        </button>
      </form>
    </section>
  );
}

/** The /notifications page: the reusable filter and pager over the notifications, and the deletion-rule settings. */
export function NotificationsPage() {
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const queryClient = useQueryClient();
  const { data } = useSuspenseQuery(notificationsQuery(search));
  const { data: settings } = useSuspenseQuery(dataConfigQuery());
  const [saved, setSaved] = useState(false);
  const markRead = useMutation({
    mutationFn: action,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const onFilter = useCallback(
    (next: { q: string; filter: string }) =>
      void navigate({ search: { q: next.q || undefined, filter: next.filter || undefined } }),
    [navigate],
  );
  const onPage = useCallback(
    (page: number) => void navigate({ search: (prev) => ({ ...prev, page: page > 1 ? page : undefined }) }),
    [navigate],
  );
  const onRead = useCallback((id: string) => markRead.mutate({ intent: 'mark-read', id }), [markRead]);
  const onSaved = useCallback(() => setSaved(true), []);
  const counts = useMemo(() => data.counts, [data.counts]);

  const message = markRead.error?.message ? markRead.error.message : saved ? 'Settings saved.' : '';

  return (
    <>
      <title>Notifications</title>
      <PageHeader title="Notifications" />
      <StatusLine message={message} isError={Boolean(markRead.error)} />
      <main className="px-6 pb-12">
        <section aria-labelledby="list-title">
          <h2 id="list-title" className="sr-only">
            Notification list
          </h2>
          <DataFilter
            label="Search and filter notifications"
            selectLabel="Type"
            options={KIND_OPTIONS}
            counts={counts}
            q={search.q ?? ''}
            filter={search.filter ?? ''}
            onChange={onFilter}
          />
          {data.items.length === 0 ? (
            <p className="py-6 text-muted">
              {search.q || search.filter ? 'No notifications match.' : 'No notifications yet.'}
            </p>
          ) : (
            <ul>
              {data.items.map((item) => (
                <NotificationRow key={item.id} item={item} onRead={onRead} busy={markRead.isPending} />
              ))}
            </ul>
          )}
          <Pager
            label="Notification pages"
            page={data.page}
            pages={data.pages}
            total={data.total}
            onPage={onPage}
          />
        </section>
        <SettingsForm rule={settings.config.deletionRule} dir={settings.dir} onSaved={onSaved} />
      </main>
    </>
  );
}
