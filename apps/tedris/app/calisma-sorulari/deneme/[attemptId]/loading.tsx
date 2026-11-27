import { Skeleton } from "@medaris/ui/mds/skeleton";

/** A result while it loads: the title, the score card with its three counts, the answers. */
export default function Loading() {
  return (
    <main
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <Skeleton width="20%" height="16px" />
      <Skeleton width="45%" height="40px" />
      <div className="mds-card flex flex-col gap-4">
        <Skeleton width="25%" height="48px" />
        <Skeleton height="8px" />
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height="88px" />
          ))}
        </div>
      </div>
      {[0, 1].map((n) => (
        <Skeleton key={n} height="160px" />
      ))}
    </main>
  );
}
