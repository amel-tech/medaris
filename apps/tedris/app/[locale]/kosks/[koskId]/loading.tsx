import { Skeleton } from "@medaris/ui/mds/skeleton";

export default function Loading() {
  return (
    <main
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <Skeleton width="30%" height="20px" />
      <Skeleton width="50%" height="56px" />
      <div className="grid gap-grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))]">
        {[0, 1, 2].map((n) => (
          <Skeleton key={n} height="200px" />
        ))}
      </div>
    </main>
  );
}
