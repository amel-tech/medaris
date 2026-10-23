import { Skeleton } from "@medaris/ui/mds/skeleton";

export default function Loading() {
  return (
    <main
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter"
      aria-busy="true"
    >
      <Skeleton width="30%" height="40px" />
      <Skeleton width="60%" height="20px" />
      <div className="grid gap-grid grid-cols-3 max-lg:grid-cols-2 max-md:grid-cols-1">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} height="260px" />
        ))}
      </div>
    </main>
  );
}
