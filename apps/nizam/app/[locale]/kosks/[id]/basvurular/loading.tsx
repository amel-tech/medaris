import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the applications are read (design nizam/31 §3): a heading and table-shaped rows. */
export default function Loading() {
  return (
    <div className="flex flex-col gap-section" aria-busy="true">
      <header className="flex flex-col gap-3">
        <Skeleton width="12rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} height="3rem" />
        ))}
      </div>
    </div>
  );
}
