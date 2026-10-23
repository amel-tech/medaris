import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the account is read (design nizam/47 §3, "Yükleniyor: Skeleton"). */
export default function Loading() {
  return (
    <div
      className="mx-auto flex w-full max-w-[80rem] flex-col gap-section"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="min(16rem, 100%)" height="2.5rem" />
        <Skeleton width="min(24rem, 100%)" height="1.25rem" />
      </header>
      <div className="grid items-start gap-section grid-cols-[minmax(0,1fr)_22rem] max-md:grid-cols-1">
        <div className="flex flex-col gap-section">
          <Skeleton height="14rem" />
          <Skeleton height="20rem" />
        </div>
        <Skeleton height="12rem" />
      </div>
    </div>
  );
}
