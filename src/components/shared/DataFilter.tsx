import { memo, useId, useRef, useState, type FormEvent } from 'react';

export type FilterOption = { value: string; label: string };

type Props = {
  /** Accessible name of the search landmark. */
  label: string;
  selectLabel: string;
  options: readonly FilterOption[];
  /** How many records each option has, shown in brackets. */
  counts?: Record<string, number> | undefined;
  /** Values currently in the URL. */
  q: string;
  filter: string;
  onChange: (next: { q: string; filter: string }) => void;
};

const DEBOUNCE_MS = 300;

const control =
  'rounded-md border border-line bg-surface px-2 py-1 text-fg focus-visible:outline-2 focus-visible:outline-accent';

/**
 * Reusable search box + select. The server matches `q` against the local vector index.
 * Typing waits 300 ms before it reports a change, so a reload never interrupts the typing.
 */
export const DataFilter = memo(function DataFilter({
  label,
  selectLabel,
  options,
  counts,
  q,
  filter,
  onChange,
}: Props) {
  const id = useId();
  const [text, setText] = useState(q);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const report = (next: { q: string; filter: string }) => {
    clearTimeout(timer.current);
    onChange(next);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    report({ q: text.trim(), filter });
  };

  return (
    <form
      role="search"
      aria-label={label}
      onSubmit={onSubmit}
      className="flex flex-wrap items-end gap-3 py-3"
    >
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-q`} className="text-xs font-medium text-muted">
          Search
        </label>
        <input
          id={`${id}-q`}
          type="search"
          maxLength={500}
          autoComplete="off"
          placeholder="Describe what to look for"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            clearTimeout(timer.current);
            const value = event.target.value.trim();
            timer.current = setTimeout(() => onChange({ q: value, filter }), DEBOUNCE_MS);
          }}
          className={`w-72 ${control}`}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-f`} className="text-xs font-medium text-muted">
          {selectLabel}
        </label>
        <select
          id={`${id}-f`}
          value={filter}
          onChange={(event) => report({ q: text.trim(), filter: event.target.value })}
          className={control}
        >
          <option value="">All</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {counts && counts[o.value] !== undefined ? `${o.label} (${counts[o.value]})` : o.label}
            </option>
          ))}
        </select>
      </div>
    </form>
  );
});
