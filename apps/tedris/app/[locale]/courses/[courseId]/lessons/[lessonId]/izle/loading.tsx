import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * The watch page while its data loads (MDRS-285): the header line, the video
 * over the width that is left and the side column with its two panels, which
 * goes under the video below about 1036 px, as the page itself does.
 */
export default function Loading() {
  return (
    <main
      className="flex inline-full flex-wrap items-start gap-4 pbs-4 pbe-10 px-6 max-md:gap-0 max-md:px-0 max-md:pbs-0"
      aria-busy="true"
    >
      <div className="flex basis-full items-center gap-4 max-md:order-2 max-md:px-gutter max-md:py-3">
        <Skeleton width="min(28rem, 100%)" height="24px" />
      </div>
      <div className="min-inline-0 flex-[999_1_640px] max-md:order-1 max-md:basis-full">
        <div className="aspect-video">
          <Skeleton height="100%" />
        </div>
      </div>
      <div className="flex min-inline-0 flex-[1_1_380px] flex-col gap-4 max-md:order-3 max-md:basis-full max-md:px-gutter">
        <Skeleton height="240px" />
        <Skeleton height="240px" />
      </div>
    </main>
  );
}
