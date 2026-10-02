import type { Metadata } from "next";
import { getTimeZone, getTranslations } from "next-intl/server";
import { SchedulePage } from "~/features/schedule/components/schedule-page";
import { getMySessions } from "~/features/schedule/reads";
import { scheduleWindow } from "~/features/schedule/schedule-model";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.SchedulePage");
  return { title: `${t("pageTitle")} | Tedris` };
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
}) {
  const { from } = await searchParams;
  const now = new Date();
  const window = scheduleWindow(
    Array.isArray(from) ? from[0] : from,
    now,
    await getTimeZone()
  );
  const sessions = await getMySessions(window.from, window.to);
  return <SchedulePage sessions={sessions} window={window} now={now} />;
}
