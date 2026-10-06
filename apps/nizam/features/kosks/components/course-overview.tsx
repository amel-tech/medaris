"use client";

import type {
  CourseDetailResponse,
  CourseStatsResponse,
  KoskCourseRowResponse,
  KoskResponse,
  RosterEnrollmentResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Stat } from "@medaris/ui/mds/stat";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useMemo, useTransition } from "react";
import { toRow } from "../../applications/present";
import { useDecisions } from "../../applications/use-decisions";
import { hiddenAtLabel, sessionWhen } from "../../archive/present";
import {
  firstMissingLink,
  listWords,
  type Messages,
  meetingSlots,
  platformOf,
  sessionCount,
  type UpcomingSession,
  upcomingSessions,
} from "../overview-present";

interface Props {
  kosk: Pick<KoskResponse, "id" | "name">;
  course: CourseDetailResponse;
  /** null when the numbers could not be read: the cards say so */
  stats: CourseStatsResponse | null;
  /** null when the roster could not be read: the section says so */
  pending: RosterEnrollmentResponse[] | null;
  /** the köşk's row of this course, for the imam; null when it could not be read */
  row: KoskCourseRowResponse | null;
  /** the course's pages in nazar, for the başnazım (`nazarCourseHref`); null for anyone else */
  nazarHref?: string | null;
}

/**
 * Genel bakış (nizam 53): one course for its köşk nazımı — the programme's
 * next sessions with the meeting links still missing, the waiting
 * applications to decide, the course's müderrisler and the settings that
 * matter. The numbers come from `GET /courses/:id/stats`; the sessions from
 * the course itself. Not drawn, because the backend has no model for them: the
 * Ders kayıtları card and section and the YouTube line. The ders nazırları and
 * the course's settings are nazar's pages (MDRS-270); the başnazım is offered
 * "Nazar’da aç" to them.
 */
export function CourseOverview({
  kosk,
  course,
  stats,
  pending,
  row,
  nazarHref = null,
}: Props) {
  const t = useTranslations("nizam.CourseOverview");
  const tm = t as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const { busy, decided, decide } = useDecisions(kosk.id);
  const now = useMemo(() => new Date(), []);
  const refresh = () => startTransition(() => router.refresh());
  const base = `/${locale}/kosks/${kosk.id}`;
  const editHref = `${base}/courses/${course.id}/edit`;

  const sessions = upcomingSessions(course, now);
  const missing = firstMissingLink(course, now);
  const slots = listWords(meetingSlots(course, locale), locale);
  const total = sessionCount(course);
  const published = course.status === "PUBLISHED";
  const unnamed = t("unnamed");
  const waiting = (pending ?? []).filter(
    (e) => !decided.has(`${e.courseId}:${e.userId}`)
  );
  const imamNames = new Set(
    (row?.muderris ?? []).filter((m) => m.isImam).map((m) => m.name)
  );

  const sessionColumns: TableColumn<UpcomingSession>[] = [
    {
      key: "session",
      header: t("columns.session"),
      rowHeader: true,
      width: "27%",
      render: (s) => (
        <span className="flex flex-col">
          <bdi>{s.lesson.title}</bdi>
          <span className="mds-caption">
            {t("weekNumber", { number: s.weekNumber })}
          </span>
        </span>
      ),
    },
    {
      key: "when",
      header: t("columns.when"),
      width: "15%",
      render: (s) => (
        <span className="whitespace-nowrap">
          {sessionWhen(s.at, { locale, timeZone })}
        </span>
      ),
    },
    {
      key: "length",
      header: t("columns.length"),
      align: "right",
      width: "8%",
      render: (s) =>
        s.lesson.durationMinutes ? (
          <span className="whitespace-nowrap tabular-nums">
            {t("minutes", { count: s.lesson.durationMinutes })}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "platform",
      header: t("columns.platform"),
      width: "12%",
      render: (s) => {
        const platform =
          s.status === "cancelled" ? null : platformOf(s.lesson.meetingUrl);
        return platform ? <Badge variant="outline">{platform}</Badge> : "—";
      },
    },
    {
      key: "status",
      header: t("columns.status"),
      width: "14%",
      render: (s) =>
        s.status === "cancelled" ? (
          <Badge variant="outline">{t("status.cancelled")}</Badge>
        ) : s.status === "missingLink" ? (
          <Badge variant="warning" icon={<Icon name="link" size="sm" />}>
            {t("status.missingLink")}
          </Badge>
        ) : (
          <Badge variant="secondary">{t("status.planned")}</Badge>
        ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "24%",
      render: (s) =>
        s.status === "cancelled" ? null : (
          <Button
            variant="outline"
            size="small"
            href={editHref}
            aria-label={t(
              s.status === "missingLink" ? "addLinkLabel" : "editSessionLabel",
              { name: s.lesson.title }
            )}
          >
            {s.status === "missingLink" ? t("addLink") : t("editSession")}
          </Button>
        ),
    },
  ];

  const applicationColumns: TableColumn<RosterEnrollmentResponse>[] = [
    {
      key: "talebe",
      header: t("columns.talebe"),
      rowHeader: true,
      width: "40%",
      render: (e) => <bdi>{e.studentName?.trim() || unnamed}</bdi>,
    },
    {
      key: "applied",
      header: t("columns.applied"),
      width: "24%",
      render: (e) => (
        <span className="whitespace-nowrap">
          {hiddenAtLabel(new Date(e.createdAt), now, {
            locale,
            timeZone,
            t: tm,
          })}
        </span>
      ),
    },
    {
      key: "decide",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "36%",
      render: (e) => {
        const application = toRow(
          { ...e, courseTitle: course.title },
          course.muderris.map((m) => m.name),
          unnamed
        );
        const name = application.name;
        return (
          <span className="flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="small"
              loading={busy === `${e.courseId}:${e.userId}`}
              aria-label={t("approveLabel", { name })}
              onClick={() => void decide(application, "approve")}
            >
              {t("approve")}
            </Button>
            <Button
              variant="link"
              size="small"
              disabled={busy !== null}
              aria-label={t("rejectLabel", { name })}
              onClick={() => void decide(application, "reject")}
            >
              {t("reject")}
            </Button>
          </span>
        );
      },
    },
  ];

  const subline = [
    kosk.name,
    t("weeks", { count: stats?.weekCount ?? course.weeks.length }),
    t("sessions", { count: total }),
    slots,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="course-overview"
    >
      <Breadcrumb
        label={t("breadcrumbLabel")}
        items={[{ label: t("courses"), href: `${base}/dersler` }, course.title]}
      />
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-2">
          <h1 className="mds-h1 flex flex-wrap items-center gap-3">
            <span>{t("title")}</span>
            <Badge variant={published ? "secondary" : "outline"}>
              {t(published ? "published" : "draft")}
            </Badge>
          </h1>
          <p>
            <bdi className="font-semibold">{course.title}</bdi>
            {" · "}
            {subline}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {nazarHref ? (
            <Button
              variant="secondary"
              href={nazarHref}
              target="_blank"
              rel="noopener noreferrer"
              iconLeft={<Icon name="externalLink" size="sm" />}
            >
              {t("openInNazar")}
              <span className="mds-visually-hidden">
                {" "}
                {t("openInNazarHint")}
              </span>
            </Button>
          ) : null}
          <Button
            variant="outline"
            href={editHref}
            iconLeft={<Icon name="edit" size="sm" />}
          >
            {t("editSyllabus")}
          </Button>
          <Button href={editHref} iconLeft={<Icon name="plus" size="sm" />}>
            {t("planSession")}
          </Button>
        </div>
      </header>

      {missing ? (
        <Alert
          tone="warning"
          title={t("missingTitle", {
            day: new Intl.DateTimeFormat(locale, {
              timeZone,
              weekday: "long",
            }).format(missing.at),
          })}
        >
          <p>
            {t("missingBody", {
              title: missing.lesson.title,
              when: new Intl.DateTimeFormat(locale, {
                timeZone,
                day: "numeric",
                month: "long",
                weekday: "long",
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }).format(missing.at),
            })}
          </p>
        </Alert>
      ) : null}

      {stats === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={refresh}>
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <section
          aria-label={t("summaryLabel")}
          className="grid gap-grid sm:grid-cols-2 lg:grid-cols-3"
        >
          <Stat
            label={t("stats.students")}
            value={stats.enrolledCount}
            locale={locale}
          />
          <Stat
            label={t("stats.pending")}
            value={stats.pendingCount}
            locale={locale}
          />
          <Stat
            label={t("stats.weeks")}
            value={stats.startedWeekCount}
            locale={locale}
          >
            <span className="mds-caption">
              {t("stats.weeksOf", { count: stats.weekCount })}
            </span>
          </Stat>
        </section>
      )}

      <section aria-labelledby="next-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="next-heading" className="mds-h2">
            {t("nextHeading")}
          </h2>
          <a
            className="mds-link"
            href={`${base}/courses/${course.id}/sessions`}
          >
            {t("allSessions")}
          </a>
        </div>
        <Table
          caption={t("nextHeading")}
          columns={sessionColumns}
          rows={sessions}
          rowKey={(s) => s.lesson.id}
          empty={t("noSessions")}
          responsive="stack"
        />
      </section>

      <div className="grid items-start gap-grid lg:grid-cols-2">
        <section
          aria-labelledby="pending-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="pending-heading" className="mds-h2">
              {t("pendingHeading")}
            </h2>
            <a
              className="mds-link"
              href={`${base}/courses/${course.id}/students`}
            >
              {t("students")}
            </a>
          </div>
          {pending === null ? (
            <Alert tone="error" title={t("loadFailedTitle")}>
              <p>{t("loadFailed")}</p>
              <Button variant="outline" size="small" onClick={refresh}>
                {t("retry")}
              </Button>
            </Alert>
          ) : (
            <Table
              caption={t("pendingHeading")}
              columns={applicationColumns}
              rows={waiting}
              rowKey={(e) => `${e.courseId}:${e.userId}`}
              empty={t("noPending")}
              responsive="stack"
            />
          )}
        </section>

        <section aria-labelledby="team-heading" className="flex flex-col gap-4">
          <h2 id="team-heading" className="mds-h2">
            {t("teamHeading")}
          </h2>
          <div className="mds-card flex flex-col gap-4">
            {course.muderris.length === 0 ? (
              <p className="mds-caption">{t("noMuderris")}</p>
            ) : (
              <ul className="flex flex-col gap-3">
                {course.muderris.map((m) => (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar name={m.name} decorative />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <bdi className="font-semibold">{m.name}</bdi>
                      <span className="mds-caption">{t("muderris")}</span>
                    </span>
                    {imamNames.has(m.name) ? (
                      <Badge variant="secondary">{t("imam")}</Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="settings-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="settings-heading" className="mds-h2">
            {t("settingsHeading")}
          </h2>
          <a className="mds-link" href={editHref}>
            {t("settings")}
          </a>
        </div>
        <dl className="mds-card grid gap-4 sm:grid-cols-3">
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("info.status")}</dt>
            <dd>{t(published ? "published" : "draft")}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("info.enrollment")}</dt>
            <dd>
              {t(
                course.requiresApproval ? "approvalRequired" : "openEnrollment"
              )}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("info.timeZone")}</dt>
            <dd>{course.timeZone}</dd>
          </div>
        </dl>
      </section>
    </div>
  );
}
