import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { getHostingRights } from "~/features/hosting/reads";
import { getKoskById, getMe } from "~/features/kosks/actions";
import { getKoskNazims } from "~/features/kosks/admin-reads";
import { KoskManagePage } from "~/features/kosks/components/kosk-manage-page";
import {
  getKoskCourseRoster,
  getKoskOverview,
} from "~/features/kosks/overview-reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskManage");
  return { title: t("title") };
}

/**
 * A köşk (design nizam/20 for the Medaris yönetimi; nizam/23 for its nazımı).
 * The başnazım gets the management view — numbers, details, the hide and
 * take-out-of-service actions, nazımları, hosting rights and the courses. A
 * köşk nazımı gets the Dersler page, where the course work is. Anyone else, or
 * a köşk that is not there, gets the "Bu bölüm için izniniz yok" screen
 * (nizam/06): the 403 and the 404 look the same on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const me = await getMe();

  if (me && !me.roles.systemAdmin) {
    if (me.roles.manages.some((k) => k.id === id)) {
      redirect(`/${locale}/kosks/${id}/dersler`);
    }
    forbidden();
  }

  const [kosk, overview, nazims, rights, roster] = await Promise.all([
    getKoskById(id),
    getKoskOverview(id),
    getKoskNazims(id),
    getHostingRights(id),
    getKoskCourseRoster(id),
  ]);

  if (overview === "not-found") notFound();
  if (overview === "forbidden") forbidden();
  // A köşk that did not read while the overview did is gone; with both failing
  // the API is down, and the page says so in place rather than as a missing right.
  if (!kosk) {
    if (overview !== null) notFound();
    const t = await getTranslations("nizam.KoskManage");
    return (
      <div className="mx-auto w-full max-w-[72rem]">
        <p role="alert">{t("loadFailed")}</p>
      </div>
    );
  }
  if (overview === null) {
    const t = await getTranslations("nizam.KoskManage");
    return (
      <div className="mx-auto w-full max-w-[72rem]">
        <p role="alert">{t("loadFailed")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <KoskManagePage
        kosk={kosk}
        overview={overview}
        nazims={Array.isArray(nazims) ? nazims : null}
        rights={Array.isArray(rights) ? rights : null}
        rows={
          roster && typeof roster === "object" && "items" in roster
            ? roster.items
            : null
        }
        viewerId={me?.id ?? null}
        koskPublicHref={
          env.TEDRIS_URL ? `${env.TEDRIS_URL}/${locale}/kosks/${id}` : null
        }
      />
    </div>
  );
}
