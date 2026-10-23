import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * What the deck pages (design tedris/28, 29, 31, 33) draw while the deck and
 * its cards are read: the header, then a table of rows. A segment-level
 * boundary, so a click from the list shows it at once instead of keeping the
 * old page up until the read answers.
 */
export default function Loading() {
  return (
    <main
      className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <Skeleton width="40%" height="40px" />
      <Skeleton width="60%" height="20px" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3, 4, 5].map((n) => (
          <Skeleton key={n} height="48px" />
        ))}
      </div>
    </main>
  );
}
