import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the ders nazırları are read (design nizam/38 §3): a heading and table-shaped rows. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[72rem] flex-col gap-section px-gutter py-8"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="10rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <div className="flex flex-col gap-3">
        {[0, 1, 2].map((row) => (
          <Skeleton key={row} height="4.5rem" />
        ))}
      </div>
    </div>
  );
}
