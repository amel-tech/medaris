import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the groups are read (design nizam/13 §3): a heading, the list and the form's blocks. */
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
      <div className="grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
        <Skeleton height="14rem" />
        <div className="flex flex-col gap-4">
          <Skeleton height="3rem" />
          <Skeleton height="8rem" />
          <Skeleton height="16rem" />
        </div>
      </div>
    </div>
  );
}
