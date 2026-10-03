import { Skeleton } from "@medaris/ui/mds/skeleton";

/**
 * The place of a form page (Hesap, Herkese açık profil, Köşk açma başvurusu)
 * while its read is in flight: a title, a line under it and two cards of
 * fields (design tedris/34 and 35 ask for a form skeleton).
 */
export function FormSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <output
      className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10"
      aria-busy="true"
    >
      <div className="flex flex-col gap-2">
        <Skeleton width="16rem" height="2.5rem" />
        <Skeleton width="min(32rem, 80%)" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} className="mds-card flex flex-col gap-5 p-card">
          <Skeleton width="12rem" height="1.75rem" />
          <Skeleton height="2.5rem" />
          <Skeleton height="2.5rem" />
        </div>
      ))}
    </output>
  );
}
