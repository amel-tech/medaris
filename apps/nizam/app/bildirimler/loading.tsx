import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while its notifications load (design nizam/37 §3, "Yükleniyor: iskelet"). */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[80rem] flex-col gap-section"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <Skeleton width="min(14rem, 100%)" height="32px" />
        <Skeleton width="min(26rem, 100%)" height="14px" />
      </div>
      <Skeleton width="12rem" height="36px" />
      <div className="flex flex-col gap-3">
        <Skeleton width="6rem" height="12px" />
        <Skeleton height="120px" />
        <Skeleton height="96px" />
      </div>
    </div>
  );
}
