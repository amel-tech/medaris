import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The medrese page while its data loads (design tedris/03, "Yükleniyor: iskelet"). */
export default function Loading() {
  return (
    <main
      className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <div className="flex flex-col gap-4">
        <Skeleton width="12rem" height="14px" />
        <div className="flex items-start gap-4">
          <Skeleton width="56px" height="56px" />
          <div className="flex flex-1 flex-col gap-3">
            <Skeleton width="6rem" height="12px" />
            <Skeleton width="min(24rem, 100%)" height="32px" />
            <Skeleton width="min(16rem, 100%)" height="14px" />
          </div>
        </div>
      </div>
      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex flex-col gap-section">
          <div className="flex flex-col gap-3">
            <Skeleton height="14px" />
            <Skeleton height="14px" />
            <Skeleton width="70%" height="14px" />
          </div>
          <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]">
            <Skeleton height="220px" />
            <Skeleton height="220px" />
          </div>
        </div>
        <Skeleton height="135px" />
      </div>
    </main>
  );
}
