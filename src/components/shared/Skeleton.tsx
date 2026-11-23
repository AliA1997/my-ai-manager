import { memo } from 'react';

/** Grey blocks shaped like the rows they stand in for (UX-1). Motion is off under prefers-reduced-motion (UX-4). */
export const SkeletonRows = memo(function SkeletonRows({
  rows = 6,
  label,
}: {
  rows?: number;
  label: string;
}) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3 px-6 py-4">
      {Array.from({ length: rows }, (_, n) => `row-${n}`).map((id) => (
        <div key={id} className="h-8 animate-pulse rounded-md bg-line motion-reduce:animate-none" />
      ))}
    </div>
  );
});
