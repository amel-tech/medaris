import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the partner applications are read: a heading, the add form and table-shaped rows. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[72rem] flex-col gap-section px-gutter py-8"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="14rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <Skeleton height="9rem" />
      {[0, 1, 2].map((row) => (
        <Skeleton key={row} height="4.5rem" />
      ))}
    </div>
  );
}
