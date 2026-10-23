import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * What Çalışma (design tedris/30) draws while the round is read: the header,
 * the progress bar and the card. A segment-level boundary, so the first paint
 * is not held back by the read of the caller's progress.
 */
export default function Loading() {
  return (
    <main
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <Skeleton width="30%" height="40px" />
      <Skeleton width="50%" height="20px" />
      <div className="mx-auto flex inline-full max-inline-[40rem] flex-col gap-5">
        <Skeleton height="12px" />
        <Skeleton height="20rem" />
      </div>
    </main>
  );
}
