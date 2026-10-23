import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * The page while the roles are read (design nizam/04 §3): the heading's place
 * and three skeleton rows in the card's shape.
 */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[40rem] flex-col items-center gap-section px-gutter py-12 text-center"
      aria-busy="true"
    >
      <header className="flex w-full flex-col items-center gap-3">
        <Skeleton width="70%" height="2.5rem" />
        <Skeleton width="90%" height="1.25rem" />
      </header>
      <section className="mds-card flex w-full flex-col gap-3 p-card text-start">
        <Skeleton width="30%" height="1.5rem" />
        {[0, 1, 2].map((row) => (
          <div key={row} className="flex items-center gap-3 py-3">
            <Skeleton width="24px" height="32px" />
            <div className="flex grow flex-col gap-2">
              <Skeleton width="60%" height="1rem" />
              <Skeleton width="40%" height="0.75rem" />
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
