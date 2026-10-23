import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The course overview while it is read (design nizam/53 §3): a heading, the number cards and rows of sessions. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[72rem] flex-col gap-section"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="14rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <div className="grid gap-grid sm:grid-cols-3">
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} height="6rem" />
        ))}
      </div>
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((row) => (
          <Skeleton key={row} height="3.5rem" />
        ))}
      </div>
    </div>
  );
}
