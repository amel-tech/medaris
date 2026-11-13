import type { Metadata } from "next";
import { forbidden } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { AppealsView } from "~/features/appeals/components/appeals-view";
import { getPendingAppeals } from "~/features/platform-admin/reads";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.AppealsPage");
  return { title: t("title") };
}

/**
 * İtirazlar: the medreses' appeals against a köşk refusing their course
 * requests. The menu entry has always pointed at `/talepler/itirazlar`, so
 * the page lives there. tedrisat answers anyone but the başnazım and a
 * Medaris nazımı holding `platform.appeal_decide` 403, which shows the
 * "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page() {
  const appeals = await getPendingAppeals();
  if (appeals === "forbidden") forbidden();

  return (
    <div className="mx-auto w-full max-w-[80rem] px-gutter py-8">
      <AppealsView initial={appeals === "not-found" ? null : appeals} />
    </div>
  );
}
