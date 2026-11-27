import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PracticeResult } from "~/features/practice/components/practice-result";
import { getPracticeAttemptRead } from "~/features/practice/reads";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.Practice");
  return { title: `${t("resultTitle")} | Tedris` };
}

/** A finished çalışma attempt's result (MDRS-248, Faz 3). */
export default async function Page({
  params,
}: {
  params: Promise<{ attemptId: string }>;
}) {
  const { attemptId } = await params;
  return <PracticeResult read={await getPracticeAttemptRead(attemptId)} />;
}
