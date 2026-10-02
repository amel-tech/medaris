import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { env } from "~/env";
import { getKoskById, getMe } from "~/features/kosks/actions";
import { KoskCoursesView } from "~/features/kosks/components/kosk-courses-view";
import { koskAbilities } from "~/features/kosks/kosk-abilities";
import {
  getKoskCourseRoster,
  getKoskOverview,
} from "~/features/kosks/overview-reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskCourses");
  return { title: t("title") };
}

/**
 * Dersler (design nizam/23): the köşk's courses by status, for its nazımları
 * and the başnazım. Anyone else, or a köşk that is not there, gets the "Bu
 * bölüm için izniniz yok" screen (nizam/06): the 403 and the 404 look the same
 * on purpose. The roster is read first because its route asks for the same
 * right as everything the page does.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  const [kosk, roster, overview, me] = await Promise.all([
    getKoskById(id),
    getKoskCourseRoster(id),
    getKoskOverview(id),
    getMe(),
  ]);

  if (roster === "not-found") notFound();
  if (roster === "forbidden") forbidden();
  // A köşk that did not read while the roster did is gone; with both failing
  // the API is down, and the page says so in place (spec §3).
  if (!kosk && roster !== null) notFound();
  if (!kosk) {
    const t = await getTranslations("nizam.KoskCourses");
    return (
      <div className="mx-auto w-full max-w-[72rem]">
        <p role="alert">{t("loadFailed")}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[72rem]">
      <KoskCoursesView
        kosk={kosk}
        overview={typeof overview === "object" ? overview : null}
        rows={typeof roster === "object" && roster ? roster.items : null}
        mayOpenCourse={koskAbilities(me, kosk).openCourse}
        tedrisUrl={env.TEDRIS_URL || null}
      />
    </div>
  );
}
