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
    <div className="mx-auto flex max-w-[80rem] flex-col gap-section px-gutter py-8">
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
    </div>
  );
}
