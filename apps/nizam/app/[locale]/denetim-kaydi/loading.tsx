import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the log is read (design nizam/17 §3): a heading, the notice, the filters and table-shaped rows. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[80rem] flex-col gap-section px-gutter py-8"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="14rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <Skeleton height="4rem" />
      <div className="grid gap-4 md:grid-cols-4">
        {[0, 1, 2, 3].map((field) => (
          <Skeleton key={field} height="3.5rem" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4].map((row) => (
          <Skeleton key={row} height="3.5rem" />
        ))}
      </div>
    </div>
  );
}
