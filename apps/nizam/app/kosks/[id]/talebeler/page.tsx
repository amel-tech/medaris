import type { Metadata } from "next";
import { forbidden, notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { KoskStudentsView } from "~/features/kosk-lists/components/kosk-students-view";
import { pageOf, searchOf } from "~/features/kosk-lists/present";
import { getKoskStudents } from "~/features/kosk-lists/reads";
import { getKoskById } from "~/features/kosks/actions";

// Behind the sign-in middleware, and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("nizam.KoskLists");
  return { title: t("students.title") };
}

/**
 * Talebeler for the whole köşk (MDRS-211, the menu of nizam/52): everyone who
 * holds a seat in one of its courses, searched (`?ara=`) and a page at a time
 * (`?sayfa=`). Names and addresses are the köşk's nazım's and the başnazım's
 * alone; anyone else gets the "Bu bölüm için izniniz yok" screen (nizam/06).
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const q = searchOf(query.ara);
  const [kosk, data] = await Promise.all([
    getKoskById(id),
    getKoskStudents(id, q, pageOf(query.sayfa)),
  ]);

  // The list is what decides: a köşk read that failed leaves only the name
  // empty, as on Başvurular.
  if (data === "not-found") notFound();
  if (data === "forbidden") forbidden();

  return (
    <div className="mx-auto max-w-[72rem] px-gutter py-8">
      <KoskStudentsView
        koskId={kosk?.id ?? id}
        koskName={kosk?.name ?? ""}
        q={q}
        data={data}
      />
    </div>
  );
}
