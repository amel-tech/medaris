import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * The solving screen while its questions come (MDRS-248): the bar, the
 * question with its options and buttons, and the question list, in their
 * own places, so nothing jumps when they arrive. Used by the page itself
 * and by the set's and the pool's `loading.tsx`.
 */
export function PracticeTakeSkeleton({ label }: { label?: string }) {
  return (
    <div className="flex flex-col gap-section" aria-busy="true">
      {label ? <p className="mds-body-sm text-neutral-muted">{label}</p> : null}
      <div className="mds-card flex flex-col gap-3">
        <Skeleton width="40%" height="28px" />
        <Skeleton height="8px" />
      </div>
      <div className="mds-card flex flex-col gap-3">
        <Skeleton width="20%" height="16px" />
        <Skeleton width="70%" height="24px" />
        {[0, 1, 2, 3].map((n) => (
          <Skeleton key={n} width="45%" height="24px" />
        ))}
        <Skeleton width="60%" height="40px" />
      </div>
      <div className="mds-card flex flex-col gap-3">
        <Skeleton width="15%" height="24px" />
        <Skeleton width="50%" height="32px" />
      </div>
    </div>
  );
}
