import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The köşk's home page while it is read (design nizam/02 §3): a heading, the four numbers, the celse table and the two lists below it. */
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
      <div className="grid gap-grid sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <Skeleton key={card} height="6rem" />
        ))}
      </div>
      <Skeleton height="18rem" />
      <div className="grid gap-section lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Skeleton height="14rem" />
        <Skeleton height="14rem" />
      </div>
    </div>
  );
}
