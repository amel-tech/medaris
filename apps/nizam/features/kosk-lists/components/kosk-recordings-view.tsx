"use client";

import type {
  KoskRecordingListResponse,
  KoskRecordingRowResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useFormatter, useTimeZone, useTranslations } from "next-intl";
import { formatInstant } from "~/features/courses/format";
import {
  courseSessionsHref,
  groupRecordings,
  pagerOf,
  recordingsHref,
  recordingVariant,
} from "../present";
import { ListFailed, ListPager } from "./list-parts";

interface Props {
  koskId: string;
  koskName: string;
  /** null when the read failed */
  data: KoskRecordingListResponse | null;
}

/**
 * Ders kayıtları for a whole köşk (MDRS-211, the menu of nizam/52): the
 * recordings of every course's sessions, grouped by course and by week
 * (nizam/59 draws one course's). Nothing is added, renamed or hidden here and
 * nothing is played: a course's heading leads to its own Celseler, where its
 * ders kayıtları are worked on. The page is in the address.
 */
export function KoskRecordingsView({ koskId, koskName, data }: Props) {
  const t = useTranslations("nizam.KoskLists");
  const format = useFormatter();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const columns: TableColumn<KoskRecordingRowResponse>[] = [
    {
      key: "recording",
      header: t("recordings.columns.recording"),
      rowHeader: true,
      width: "44%",
      render: (r) => (
        <span className="flex min-w-0 flex-col gap-1">
          <bdi className="font-semibold">{r.title}</bdi>
          <span className="mds-caption">
            {[
              r.sessionAt
                ? t("recordings.session", {
                    when: formatInstant(
                      format,
                      new Date(r.sessionAt),
                      timeZone,
                      "short"
                    ),
                  })
                : null,
              r.durationMinutes
                ? t("minutes", { minutes: r.durationMinutes })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "source",
      header: t("recordings.columns.source"),
      width: "20%",
      render: (r) => t(`recordings.provider.${r.provider}` as never),
    },
    {
      key: "status",
      header: t("recordings.columns.status"),
      width: "16%",
      render: (r) => (
        <Badge variant={recordingVariant(r.status)}>
          {t(`recordings.status.${r.status}` as never)}
        </Badge>
      ),
    },
    {
      key: "visibility",
      header: t("recordings.columns.visibility"),
      width: "20%",
      render: (r) => t(`recordings.visibility.${r.visibility}` as never),
    },
  ];

  const pager = data
    ? pagerOf(data.page, data.limit, data.total, data.items.length)
    : null;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-recordings"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("recordings.title")}</h1>
        <p className="mds-reading m-0 max-w-[48rem]">
          {t("recordings.intro", { kosk: koskName })}
        </p>
      </header>

      {data === null || pager === null ? (
        <ListFailed
          title={t("recordings.loadFailedTitle")}
          href={recordingsHref(koskId)}
        />
      ) : data.items.length === 0 ? (
        <>
          <EmptyState>
            {data.total > 0 ? t("pager.pastEnd") : t("recordings.empty")}
          </EmptyState>
          <ListPager
            pager={pager}
            total={data.total}
            hrefOf={(page) => recordingsHref(koskId, page)}
          />
        </>
      ) : (
        <div className="flex flex-col gap-section">
          <p className="mds-caption m-0" data-testid="kosk-recordings-total">
            {t("recordings.total", { count: data.total })}
          </p>
          {groupRecordings(data.items).map((course) => (
            <section
              key={course.courseId}
              aria-labelledby={`recordings-${course.courseId}`}
              className="flex flex-col gap-4"
              data-testid="kosk-recordings-course"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-3">
                <h2 id={`recordings-${course.courseId}`} className="mds-h2 m-0">
                  <bdi>{course.courseTitle}</bdi>
                </h2>
                <a
                  className="mds-link"
                  href={courseSessionsHref(koskId, course.courseId)}
                  aria-label={t("recordings.goToCourseLabel", {
                    course: course.courseTitle,
                  })}
                >
                  {t("recordings.goToCourse")}
                </a>
              </div>
              {course.weeks.map((week) => (
                <div key={week.weekNumber} className="flex flex-col gap-2">
                  <h3 className="mds-eyebrow m-0">
                    {t("week", { n: week.weekNumber })}
                  </h3>
                  <p className="m-0 font-semibold">
                    <bdi>{week.weekTitle}</bdi>
                  </p>
                  <Table
                    caption={t("recordings.caption", {
                      course: course.courseTitle,
                      n: week.weekNumber,
                    })}
                    columns={columns}
                    rows={week.items}
                    rowKey={(r) => r.id}
                    responsive="stack"
                  />
                </div>
              ))}
            </section>
          ))}
          <ListPager
            pager={pager}
            total={data.total}
            hrefOf={(page) => recordingsHref(koskId, page)}
          />
        </div>
      )}
    </div>
  );
}
