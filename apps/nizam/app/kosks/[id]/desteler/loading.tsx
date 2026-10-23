import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the köşk's decks are read (design nizam/30 §3): a heading, proposal cards and table-shaped rows. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[72rem] flex-col gap-section px-gutter py-8"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="12rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <div className="grid gap-grid md:grid-cols-2">
        {[0, 1].map((card) => (
          <Skeleton key={card} height="10rem" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height="3.5rem" />
        ))}
      </div>
    </div>
  );
}
