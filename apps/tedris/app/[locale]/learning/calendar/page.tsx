import { Breadcrumbs } from "@medaris/ui/components/breadcrumb";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getMyCalendarFeed } from "~/features/courses/actions";
import { CalendarSubscription } from "~/features/courses/components/calendar-subscription";

/** B11 "Takvim aboneliği" (MDRS-120). */
export default async function CalendarSubscriptionPage() {
  const t = await getTranslations("tedris");
  const feed = await getMyCalendarFeed();

  return (
    <div className="max-w-2xl pb-16">
      <Breadcrumbs
        className="mb-4"
        linkComponent={Link}
        items={[
          { label: t("TabView.learning"), href: "/learning" },
          {
            label: t("MyCoursesPage.breadcrumb"),
            href: "/learning/my-courses",
          },
          { label: t("CalendarSubscription.breadcrumb") },
        ]}
      />

      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {t("CalendarSubscription.title")}
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {t("CalendarSubscription.subtitle")}
        </p>
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
