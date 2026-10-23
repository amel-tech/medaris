import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The köşk page while it is read (design nizam/20 §3): a heading, the four number cards, the details and the table-shaped rows. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[72rem] flex-col gap-section"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="16rem" height="2.5rem" />
        <Skeleton width="50%" height="1.25rem" />
      </header>
      <div className="grid gap-grid sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} height="6rem" />
        ))}
      </div>
      <Skeleton height="14rem" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height="3.5rem" />
        ))}
      </div>
    </div>
  );
}
