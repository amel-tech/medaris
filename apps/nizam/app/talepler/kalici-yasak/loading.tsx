import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the requests are read: a heading, the two tabs and the cards. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[80rem] flex-col gap-section px-gutter py-8"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="18rem" height="2.5rem" />
        <Skeleton width="70%" height="1.25rem" />
        <Skeleton width="55%" height="1.25rem" />
      </header>
      <Skeleton width="20rem" height="2.5rem" />
      <div className="flex flex-col gap-grid">
        {[0, 1].map((row) => (
          <Skeleton key={row} height="18rem" />
        ))}
      </div>
    </div>
  );
}
