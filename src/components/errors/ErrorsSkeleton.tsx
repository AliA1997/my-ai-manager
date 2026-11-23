import { PageHeader } from '../shared/PageHeader';
import { SkeletonRows } from '../shared/Skeleton';

/** Shown while the errors loader runs: the real header, and rows shaped like the table (UX-1). */
export function ErrorsSkeleton() {
  return (
    <>
      <PageHeader title="Error logs" />
      <main>
        <SkeletonRows label="Loading error logs" rows={6} />
      </main>
    </>
  );
}
