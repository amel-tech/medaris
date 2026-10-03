import { Skeleton } from "@medaris/ui/mds/skeleton";

/** The section's place while its two reads are in flight. */
export function RolesSectionSkeleton() {
  return (
    <output className="mds-card flex flex-col gap-4 p-card" aria-busy="true">
      <Skeleton width="40%" height="1.75rem" />
      <Skeleton width="80%" />
      <Skeleton height="8rem" />
    </output>
  );
}
