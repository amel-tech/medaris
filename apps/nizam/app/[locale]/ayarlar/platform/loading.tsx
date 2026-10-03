import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the settings are read (design nizam/19 §3): a heading, two switches and the table. */
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
      {[0, 1].map((policy) => (
        <Skeleton key={policy} height="5rem" />
      ))}
      <Skeleton height="10rem" />
    </div>
  );
}
