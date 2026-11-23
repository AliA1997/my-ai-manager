import { PageHeader } from '../shared/PageHeader';
import { SkeletonRows } from '../shared/Skeleton';

/** Shown while the logs loader runs: the real header, and entries shaped like the transcript (UX-1). */
export function LogsSkeleton() {
  return (
    <>
      <PageHeader title="Claude session logs" />
      <main>
        <SkeletonRows label="Loading the transcript" rows={6} />
      </main>
    </>
  );
}
