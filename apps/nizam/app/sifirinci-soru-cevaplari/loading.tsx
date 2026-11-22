import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The page while the counts are read: a heading, the hadith, the filters and question-shaped cards. */
export default function Loading() {
  return (
    <div
      className="mx-auto flex max-w-[72rem] flex-col gap-section px-gutter py-8"
      aria-busy="true"
    >
      <header className="flex flex-col gap-3">
        <Skeleton width="16rem" height="2.5rem" />
        <Skeleton width="60%" height="1.25rem" />
      </header>
      <div className="grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((field) => (
          <Skeleton key={field} height="3.5rem" />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((card) => (
          <Skeleton key={card} height="9rem" />
        ))}
      </div>
    </div>
  );
}
