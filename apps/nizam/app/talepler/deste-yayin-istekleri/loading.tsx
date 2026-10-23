import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the requests are read (design nizam/16 §3): a heading, the notice, tabs and a list beside a detail. */
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
      <Skeleton height="5rem" />
      <div className="grid gap-grid lg:grid-cols-[22rem_1fr]">
        <div className="flex flex-col gap-3">
          {[0, 1].map((row) => (
            <Skeleton key={row} height="5rem" />
          ))}
        </div>
        <Skeleton height="26rem" />
      </div>
    </div>
  );
}
