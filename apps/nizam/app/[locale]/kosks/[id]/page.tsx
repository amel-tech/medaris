import type { Metadata } from "next";
import { forbidden, notFound, redirect } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { getHostingRights } from "~/features/hosting/reads";
import { getKoskById, getMe } from "~/features/kosks/actions";
import { getKoskNazims } from "~/features/kosks/admin-reads";
import { KoskManagePage } from "~/features/kosks/components/kosk-manage-page";
import { LoadFailed } from "~/features/kosks/components/load-failed";
import { koskEntry, needsHostingRead } from "~/features/kosks/kosk-entry";
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
 * köşk nazımı gets the Dersler page, where the course work is. A Medaris
 * nazımı whom tedrisat lets read the köşk's hosting rights goes to Barındırma
 * hakları (MDRS-137). Anyone else, or a köşk that is not there, gets the "Bu
 * bölüm için izniniz yok" screen (nizam/06): the 403 and the 404 look the same
 * on purpose.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const me = await getMe();

  const entry = koskEntry(
    me,
    id,
    needsHostingRead(me, id) ? await getHostingRights(id) : null
  );
  if (entry.to === "dersler") redirect(`/${locale}/kosks/${id}/dersler`);
  if (entry.to === "hosting") {
    redirect(`/${locale}/kosks/${id}/ayarlar/barindirma`);
  }
  if (entry.to === "forbidden") forbidden();

  const [kosk, overview, nazims, rights, roster] = await Promise.all([
    getKoskById(id),
    getKoskOverview(id),
    getKoskNazims(id),
    getHostingRights(id),
    getKoskCourseRoster(id),
  ]);

  if (overview === "not-found") notFound();
  if (overview === "forbidden") forbidden();
  // The overview is the page's own read: without it the API is down (or the
  // köşk is gone, which the overview would have said as "not-found" above), so
  // the page says so in place and offers a retry rather than a missing right.
  if (overview === null) {
    const t = await getTranslations("nizam.KoskManage");
    return (
      <div className="mx-auto w-full max-w-[72rem]">
        <LoadFailed
          title={t("loadFailedTitle")}
          message={t("loadFailed")}
          retry={t("retry")}
        />
      </div>
    );
  }
  // A köşk that did not read while the overview did is gone.
  if (!kosk) notFound();

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
