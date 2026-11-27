import { PracticeTakeSkeleton } from "~/features/practice/components/practice-take-skeleton";

/** The solving screen's own shape while the route loads, not the list's. */
export default function Loading() {
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <PracticeTakeSkeleton />
    </main>
  );
}
