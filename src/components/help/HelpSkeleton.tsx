import { PageHeader } from '../shared/PageHeader';
import { SkeletonRows } from '../shared/Skeleton';

/** Shown while the help loads: the real header and rows shaped like the command table (UX-1). */
export function HelpSkeleton() {
  return (
    <>
      <PageHeader title="Help" />
      <main>
        <SkeletonRows label="Loading the help" rows={8} />
      </main>
    </>
  );
}
