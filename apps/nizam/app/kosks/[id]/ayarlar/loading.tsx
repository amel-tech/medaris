import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The köşk settings pages while they are read (design nizam/24 and 25 §3): a heading, the tab strip and blocks. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[72rem] flex-col gap-6"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="14rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <Skeleton width="22rem" height="2rem" />
      <Skeleton height="12rem" />
      <Skeleton height="6rem" />
    </div>
  );
}
