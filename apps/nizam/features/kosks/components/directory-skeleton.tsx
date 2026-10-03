import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the köşks are read (design nizam/09 §3): a heading, the tabs and table-shaped rows. */
export function DirectorySkeleton() {
  return (
    <div className="flex flex-col gap-section" aria-busy="true">
      <header className="flex flex-col gap-3">
        <Skeleton width="10rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <Skeleton width="16rem" height="2rem" />
      <Skeleton height="2.5rem" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height="3.5rem" />
        ))}
      </div>
    </div>
  );
}
