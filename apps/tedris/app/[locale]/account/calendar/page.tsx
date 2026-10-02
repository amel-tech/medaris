import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { getMyCalendarFeed } from "~/features/courses/actions";
import { CalendarSubscription } from "~/features/courses/components/calendar-subscription";

// Behind the sign-in middleware (not in `publicPages`), and per caller.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedris.CalendarSubscription");
  return { title: `${t("title")} | Tedris` };
}

/** "Takvim aboneliği" (design tedris/23, MDRS-120/163), under Hesap. */
export default async function CalendarSubscriptionPage() {
  const t = await getTranslations("tedris.CalendarSubscription");
  const feed = await getMyCalendarFeed();

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-col gap-4">
        <Breadcrumb
          label={t("trail")}
          items={[
            { label: t("breadcrumbAccount"), href: "/account" },
            { label: t("breadcrumb") },
          ]}
        />
        <header className="flex max-w-[48rem] flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p className="mds-body">{t("subtitle")}</p>
        </header>
      </div>
      <CalendarSubscription
        status={
          feed && {
            createdAt: feed.createdAt
              ? new Date(feed.createdAt).toISOString()
              : null,
          }
        }
      />
    </main>
  );
}
