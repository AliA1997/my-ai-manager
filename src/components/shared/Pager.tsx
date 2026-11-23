import { memo } from 'react';

type Props = {
  /** Accessible name of the pagination landmark. */
  label: string;
  page: number;
  pages: number;
  total?: number | undefined;
  onPage: (page: number) => void;
};

const button =
  'rounded-md border border-line bg-surface px-3 py-1 text-fg hover:bg-page focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50';

/** Previous / Next with a "Page n of m" label that screen readers hear. Hidden when there is one page. */
export const Pager = memo(function Pager({ label, page, pages, total, onPage }: Props) {
  return (
    <nav aria-label={label} hidden={pages <= 1} className="flex items-center gap-3 py-3">
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className={button}>
        Previous
      </button>
      <span aria-live="polite" className="text-muted">
        Page {page} of {pages}
        {typeof total === 'number' ? ` · ${total} in total` : ''}
      </span>
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} className={button}>
        Next
      </button>
    </nav>
  );
});
