import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The notifications page while its data loads (design tedris/36, "Yükleniyor: iskelet"). */
export default function Loading() {
  return (
    <div
      className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <Skeleton width="min(14rem, 100%)" height="32px" />
        <Skeleton width="min(22rem, 100%)" height="14px" />
      </div>
      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex flex-col gap-6">
          <Skeleton width="12rem" height="36px" />
          <Skeleton width="6rem" height="12px" />
          <Skeleton height="120px" />
          <Skeleton height="96px" />
        </div>
        <Skeleton height="320px" />
      </div>
    </div>
  );
}
