import { PageHeader } from '../shared/PageHeader';
import { SkeletonRows } from '../shared/Skeleton';

/** Shown while the dashboard loader runs: the real header and three columns shaped like the final layout (UX-1). */
export function HomeSkeleton() {
  return (
    <>
      <PageHeader title="Claude Manager" />
      <main className="grid gap-6 lg:grid-cols-[2fr_1fr_1fr]">
        <SkeletonRows label="Loading features" rows={3} />
        <SkeletonRows label="Loading history" rows={4} />
        <SkeletonRows label="Loading sessions" rows={4} />
      </main>
    </>
  );
}
