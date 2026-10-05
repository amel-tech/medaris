import { AppShell, Sidebar } from "@medaris/ui/mds/app-shell";
import { Logo } from "@medaris/ui/mds/logo";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { getTranslations } from "next-intl/server";

/**
 * The page while the roles are read (nazir 02 §3): the shell's own shape in
 * skeletons, so that nothing is drawn and then replaced. One for the whole
 * portal; it knows no scope, so it shows none.
 */
export default async function Loading() {
  const t = await getTranslations("nazir.Shell");
  return (
    <AppShell
      density="compact"
      sidebar={
        <Sidebar
          brand={<Logo app="nazir" wordmark />}
          scope={
            <div className="flex flex-col gap-3">
              <Skeleton height="3.5rem" />
              {[0, 1, 2, 3, 4, 5].map((row) => (
                <Skeleton key={row} height="1.5rem" />
              ))}
            </div>
          }
        />
      }
    >
      <output className="flex flex-col gap-section" aria-busy="true">
        <span className="mds-visually-hidden">{t("loadingLabel")}</span>
        <Skeleton width="14rem" height="2.5rem" />
        <Skeleton height="12rem" />
        <Skeleton height="8rem" />
      </output>
    </AppShell>
  );
}
