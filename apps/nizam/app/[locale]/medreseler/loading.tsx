import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the medreses are read (design nizam/07 §3): a heading, the tabs and table-shaped rows. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[80rem] flex-col gap-section"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="14rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <Skeleton width="16rem" height="2rem" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height="3.5rem" />
        ))}
      </div>
    </div>
  );
}
