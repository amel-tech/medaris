import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * `/` while it is read (design nizam/01 and 05): a heading, the platform
 * numbers and the cards below. The page sits in the `(home)` group so this
 * skeleton stands in for the home page alone, not for every page under the
 * locale.
 */
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
      <div className="grid gap-section lg:grid-cols-2">
        <Skeleton height="14rem" />
        <Skeleton height="14rem" />
      </div>
    </div>
  );
}
