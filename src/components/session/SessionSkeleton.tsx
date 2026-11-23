import { memo } from 'react';

/** Shown while the session loader runs: the stage and the panel, shaped like the real page (UX-1). */
export const SessionSkeleton = memo(function SessionSkeleton() {
  return (
    <div role="status" aria-label="Loading the review" className="flex h-screen">
      <div className="flex-1 p-4">
        <div className="size-full animate-pulse rounded-md bg-line motion-reduce:animate-none" />
      </div>
      <div className="flex w-96 flex-col gap-3 border-l border-line p-4">
        {['header', 'connection', 'chat-1', 'chat-2', 'composer'].map((id) => (
          <div key={id} className="h-10 animate-pulse rounded-md bg-line motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
});
