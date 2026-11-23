import { PageHeader } from '../shared/PageHeader';
import { SkeletonRows } from '../shared/Skeleton';

/** Shown while the notifications loader runs: the real header, and rows shaped like the list (UX-1). */
export function NotificationsSkeleton() {
  return (
    <>
      <PageHeader title="Notifications" />
      <main>
        <SkeletonRows label="Loading notifications" rows={5} />
      </main>
    </>
  );
}
