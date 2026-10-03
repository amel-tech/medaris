import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { getHostingRights } from "~/features/hosting/reads";
import { getKoskById, getMe } from "~/features/kosks/actions";
import { getKoskNazims } from "~/features/kosks/admin-reads";
import { NazimsView } from "~/features/kosks/components/nazims-view";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskNazims");
  return { title: t("title") };
}

/**
 * Köşk nazımları (design nizam/25, with nizam/21's dialog): who runs the
 * köşk, for its nazımları and the başnazım. Anyone else, or a köşk that is not
 * there, gets the "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, nazims, rights, me] = await Promise.all([
    getKoskById(id),
    getKoskNazims(id),
    getHostingRights(id),
    getMe(),
  ]);

  if (nazims === "not-found") notFound();
  if (nazims === "forbidden") forbidden();
  // A köşk that did not read while the list did is gone; with both failing the
  // API is down, and the page says so in place rather than as a missing right.
  if (!kosk && nazims !== null) notFound();

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <NazimsView
        koskId={id}
        koskName={kosk?.name ?? ""}
        nazims={nazims}
        viewerId={me?.id ?? null}
        chief={me?.roles.systemAdmin ?? false}
        hostingCount={Array.isArray(rights) ? rights.length : undefined}
      />
    </div>
  );
}
