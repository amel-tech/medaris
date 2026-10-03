import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * What the course page shows while the course is read (designs tedris/05 and
 * 12): the breadcrumb, the cover with the title, and the programme's weeks.
 */
export default function Loading() {
  return (
    <div
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <Skeleton width="30%" height="20px" />
      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex min-inline-0 flex-col gap-section">
          <div className="flex items-start gap-6 max-md:flex-col">
            <Skeleton width="165px" height="220px" />
            <div className="flex min-inline-0 flex-1 flex-col gap-3">
              <Skeleton width="60%" height="44px" />
              <Skeleton height="16px" />
              <Skeleton width="80%" height="16px" />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((n) => (
              <Skeleton key={n} height="64px" />
            ))}
          </div>
        </div>
        <Skeleton height="280px" />
      </div>
    </div>
  );
}
