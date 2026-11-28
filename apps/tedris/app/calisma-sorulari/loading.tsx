import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The list while it loads: the title, then a course heading over a table of sets. */
export default function Loading() {
  return (
    <main
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <div className="flex flex-col gap-3">
        <Skeleton width="30%" height="40px" />
        <Skeleton width="60%" height="20px" />
      </div>
      <div className="flex flex-col gap-4">
        <Skeleton width="35%" height="32px" />
        <div className="mds-card flex flex-col gap-3">
          {[0, 1, 2, 3, 4].map((n) => (
            <Skeleton key={n} height="36px" />
          ))}
        </div>
        <Skeleton height="96px" />
      </div>
    </main>
  );
}
