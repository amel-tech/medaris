"use client";

import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { sessionPagePath } from "../calendar-links";
import type { CourseDocuments } from "../documents-model";
import { isPlainWeekTitle } from "../recordings-model";
import { ResourceList } from "./course-resources";

/**
 * The "Dokümanlar" tab of the course page (MDRS-248): first the course's own
 * documents under "Ders geneli", then each celse's, week by week as in the
 * programme, every celse under its title, which opens its page. The rows are
 * the celse page's (`ResourceList`): a file downloads through this app, a
 * link opens in a new tab. The course page draws the tab only for a viewer
 * who may read the content, so every row here is linked.
 */
export const DocumentsTab = ({
  documents,
  courseId,
}: {
  documents: CourseDocuments;
  courseId: string;
}) => {
  const t = useTranslations("tedrisLearn.DocumentsTab");
  const locale = useLocale();

  if (documents.count === 0) return <EmptyState>{t("empty")}</EmptyState>;

  const labels = { newTab: t("newTab"), download: t("download") };

  return (
    <section
      className="flex flex-col gap-3"
      aria-labelledby="all-documents"
      data-testid="documents-tab"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="mds-h3" id="all-documents">
          {t("allTitle")}
        </h2>
        <span className="mds-caption">{t("allHint")}</span>
      </div>
      <div
        className="mds-card @container flex flex-col gap-4"
        data-density="compact"
      >
        {documents.general.length > 0 ? (
          <section
            className="flex flex-col gap-2"
            aria-labelledby="documents-general"
            data-testid="documents-general"
          >
            <h3 className="m-0 px-3" id="documents-general">
              <span className="mds-eyebrow">{t("general")}</span>
            </h3>
            <ResourceList
              resources={documents.general}
              labels={labels}
              locale={locale}
            />
          </section>
        ) : null}
        {documents.weeks.map((week) => (
          <section
            key={week.weekId}
            className="flex flex-col gap-2"
            aria-labelledby={`documents-week-${week.weekId}`}
            data-testid="documents-week"
          >
            <h3
              className="m-0 flex flex-wrap items-baseline gap-x-2 px-3"
              id={`documents-week-${week.weekId}`}
            >
              <span className="mds-eyebrow">
                {t("weekLabel", { number: week.weekNumber })}
              </span>{" "}
              {isPlainWeekTitle(week.weekTitle, week.weekNumber) ? null : (
                <span className="mds-label" dir="auto">
                  {week.weekTitle}
                </span>
              )}
            </h3>
            {week.sessions.map((session) => (
              <div key={session.lessonId} className="flex flex-col gap-2">
                <h4 className="m-0 px-3">
                  <Link
                    className="mds-label inline-flex items-center gap-1 text-neutral-default hover:underline"
                    href={sessionPagePath(courseId, session.lessonId)}
                    aria-label={t("sessionLabel", { title: session.title })}
                    data-testid="documents-session-link"
                  >
                    <bdi>{session.title}</bdi>
                    <Icon name="chevronRight" size="sm" />
                  </Link>
                </h4>
                <ResourceList
                  resources={session.rows}
                  labels={labels}
                  locale={locale}
                />
              </div>
            ))}
          </section>
        ))}
      </div>
    </section>
  );
};
