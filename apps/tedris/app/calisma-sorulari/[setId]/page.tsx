import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PracticeTake } from "~/features/practice/components/practice-take";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Practice");
  return { title: `${t("pageTitle")} | Tedris` };
}

/**
 * Solving a çalışma seti (MDRS-248, Faz 3). The attempt is started (or the
 * one in progress taken back) by the page in the browser, with a Server
 * Action: never by rendering this page, which a prefetch could do.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ setId: string }>;
}) {
  const { setId } = await params;
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <PracticeTake setId={setId} />
    </main>
  );
}
