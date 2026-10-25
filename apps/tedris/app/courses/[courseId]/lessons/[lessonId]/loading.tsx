import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The session page while its data loads (design tedris/15, "Yükleniyor: iskelet"). */
export default function Loading() {
  return (
    <main
      className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <div className="flex flex-col gap-4">
        <Skeleton width="min(24rem, 100%)" height="14px" />
        <Skeleton width="6rem" height="12px" />
        <Skeleton width="min(28rem, 100%)" height="32px" />
      </div>
      <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
        <div className="flex flex-col gap-section">
          <div className="grid items-start gap-6 grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] max-md:grid-cols-1">
            <Skeleton height="220px" />
            <Skeleton height="260px" />
          </div>
          <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(280px,100%),1fr))]">
            <Skeleton height="96px" />
            <Skeleton height="96px" />
          </div>
        </div>
        <div className="flex flex-col gap-4">
          <Skeleton height="110px" />
          <Skeleton height="320px" />
        </div>
      </div>
    </main>
  );
}
