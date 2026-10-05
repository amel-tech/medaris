"use client";

import type {
  KoskCourseRowResponse,
  KoskOverviewResponse,
  KoskResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Stat } from "@medaris/ui/mds/stat";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { KoskCourseTable } from "./kosk-course-table";

interface Props {
  kosk: KoskResponse;
  /** null when the read failed: the cards are left out and the page says so */
  overview: KoskOverviewResponse | null;
  /** null when the read failed */
  rows: KoskCourseRowResponse[] | null;
  /** whether "Ders aç" is offered (kosk MANAGE_COURSES) */
  mayOpenCourse: boolean;
  /** tedris's address, for "Köşk sayfasını gör" and "Dersi gör"; null when this deployment has none */
  tedrisUrl: string | null;
}

/**
 * Dersler (nizam 23): the köşk nazımı's list of the köşk's courses — its own
 * and those the medreses with a hosting right opened in it — with the four
 * cards that lead to the other pages and the table by status. A medrese's
 * course has no "Düzenle": the medrese opens it and picks its müderrisler; the
 * nazım may view it and hide it. Tabs and cards are the data's own numbers.
 */
export function KoskCoursesView({
  kosk,
  overview,
  rows,
  mayOpenCourse,
  tedrisUrl,
}: Props) {
  const t = useTranslations("nizam.KoskCourses");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());
  const base = `/${locale}/kosks/${kosk.id}`;
  const koskPublicHref = tedrisUrl
    ? `${tedrisUrl}/${locale}/kosks/${kosk.id}`
    : null;
  const courseHref = tedrisUrl
    ? (courseId: string) => `${tedrisUrl}/${locale}/courses/${courseId}`
    : undefined;

  const cards: {
    key: string;
    label: string;
    value: number;
    link: string;
    href: string;
  }[] = overview
    ? [
        {
          key: "applications",
          label: t("cards.applications"),
          value: overview.pendingApplications,
          link: t("cards.applicationsLink"),
          href: `${base}/basvurular`,
        },
        {
          key: "hosting",
          label: t("cards.hosting"),
          value: overview.hostingMadrasahs.length,
          link: t("cards.hostingLink"),
          href: `${base}/ayarlar/barindirma`,
        },
        {
          key: "nazims",
          label: t("cards.nazims"),
          value: overview.nazimCount,
          link: t("cards.nazimsLink"),
          href: `${base}/ayarlar/nazimlar`,
        },
      ]
    : [];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-courses"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>
            {[kosk.name, kosk.isPrivate ? t("unlisted") : t("listed")]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {koskPublicHref ? (
            <Button
              variant="outline"
              href={koskPublicHref}
              target="_blank"
              rel="noopener noreferrer"
              iconRight={<Icon name="externalLink" size="sm" />}
            >
              {t("publicPage")}
              <span className="mds-visually-hidden"> {t("newTab")}</span>
            </Button>
          ) : null}
          {mayOpenCourse ? (
            <Button
              href={`${base}/courses/new`}
              iconLeft={<Icon name="plus" size="sm" />}
            >
              {t("open")}
            </Button>
          ) : null}
        </div>
      </header>

      <section
        aria-label={t("cardsLabel")}
        className="grid gap-grid sm:grid-cols-2 lg:grid-cols-3"
      >
        {overview === null ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <Alert tone="error" title={t("loadFailedTitle")}>
              <p>{t("loadFailed")}</p>
              <Button variant="outline" size="small" onClick={refresh}>
                {t("retry")}
              </Button>
            </Alert>
          </div>
        ) : (
          cards.map((card) => (
            <Stat
              key={card.key}
              label={card.label}
              value={card.value}
              locale={locale}
            >
              <a className="mds-link" href={card.href}>
                {card.link}
              </a>
            </Stat>
          ))
        )}
      </section>

      <section
        aria-labelledby="courses-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="courses-heading" className="mds-h2">
            {t("heading")}
          </h2>
          <a className="mds-link" href={`${base}/arsiv`}>
            {t("archive")}
          </a>
        </div>
        <p className="max-w-[60rem]">{t("intro")}</p>
        {rows === null ? (
          <Alert tone="error" title={t("loadFailedTitle")}>
            <p>{t("loadFailed")}</p>
            <Button variant="outline" size="small" onClick={refresh}>
              {t("retry")}
            </Button>
          </Alert>
        ) : (
          <KoskCourseTable
            koskId={kosk.id}
            rows={rows}
            mode="nazim"
            caption={t("caption")}
            viewHref={courseHref}
          />
        )}
        <p className="mds-caption">{t("hiddenInArchive")}</p>
      </section>
    </div>
  );
}
