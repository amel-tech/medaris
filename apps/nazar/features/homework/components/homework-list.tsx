"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import { Select } from "@medaris/ui/mds/select";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { DEFAULT_TIME_ZONE, timeZoneCity } from "@medaris/utils";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FileLink } from "../../files/components/file-link";
import { fileRoutes } from "../../files/files";
import { whenLabel } from "../../sessions/sessions";
import {
  ALL_SESSIONS,
  changedLabel,
  type HomeworkRow,
  type HomeworkSession,
  hasHomework,
  homeworkCounts,
  noteExcerpt,
  shownSessions,
} from "../homework";

/**
 * The body of Ödevler (MDRS-290): a filter of the course's celses ("Bütün
 * celseler" first, then each in programme order with how many handed in),
 * and a table per celse: the talebe, the files they handed in (download
 * links with type and size), when they last changed it, on the course's
 * clock, and their note, cut short with a way to read it whole. Each celse
 * says under its heading whether the course team set homework on it ("Ödev
 * verildi" or "Ödev verilmedi") and "N / M teslim": how many of the enrolled
 * talebe handed in. "Bütün celseler" draws the celses with homework set or
 * handed in; one celse is drawn even when nobody has handed in on it, and
 * its table says so.
 */
export function HomeworkList({
  courseId,
  sessions,
  locale,
  courseTimeZone,
}: {
  courseId: string;
  sessions: HomeworkSession[];
  locale: string;
  /** the course's zone, which every time on the page is written in */
  courseTimeZone: string;
}) {
  const t = useTranslations("nazar");
  const [value, setValue] = useState<string>(ALL_SESSIONS);
  const counts = homeworkCounts(sessions);
  const shown = shownSessions(sessions, value);
  const zone =
    courseTimeZone === DEFAULT_TIME_ZONE
      ? t("Homework.zoneIstanbul")
      : timeZoneCity(courseTimeZone);
  const dash = <span aria-hidden="true">—</span>;

  if (!hasHomework(sessions)) {
    return (
      <Alert tone="info" title={t("Homework.emptyTitle")}>
        <p>{t("Homework.emptyBody")}</p>
      </Alert>
    );
  }

  const options = [
    { value: ALL_SESSIONS, label: t("Homework.allSessions") },
    ...sessions.map((session) => ({
      value: session.lessonId,
      label: t("Homework.sessionOption", {
        week: session.weekNumber,
        title: session.title,
        count: session.rows.length,
      }),
    })),
  ];

  const columns = (title: string): TableColumn<HomeworkRow>[] => [
    {
      key: "talebe",
      header: t("Homework.columns.talebe"),
      rowHeader: true,
      width: "20%",
      render: (row) => (
        <span className="font-semibold">
          <bdi>{row.talebe ?? t("Homework.unknownTalebe")}</bdi>
        </span>
      ),
    },
    {
      key: "files",
      header: t("Homework.columns.files"),
      width: "36%",
      render: (row) =>
        row.files.length === 0 ? (
          <span className="text-neutral-muted">{t("Homework.noFiles")}</span>
        ) : (
          <ul
            className="m-0 flex list-none flex-col gap-2 p-0"
            aria-label={t("Homework.filesOf", {
              name: row.talebe ?? t("Homework.unknownTalebe"),
              session: title,
            })}
          >
            {row.files.map((file) => (
              <li key={file.id}>
                <FileLink
                  file={file}
                  href={fileRoutes.submissionFile(courseId, file.id)}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        ),
    },
    {
      key: "changed",
      header: t("Homework.columns.changed"),
      width: "16%",
      render: (row) => (
        <time dateTime={row.updatedAt}>
          {changedLabel(new Date(row.updatedAt), locale, courseTimeZone)}
        </time>
      ),
    },
    {
      key: "note",
      header: t("Homework.columns.note"),
      width: "28%",
      render: (row) => (row.note?.trim() ? <NoteCell note={row.note} /> : dash),
    },
  ];

  return (
    <div className="flex flex-col gap-6" data-testid="homework">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Select
          aria-label={t("Homework.filterLabel")}
          options={options}
          value={value}
          onChange={(next) => setValue(next ?? ALL_SESSIONS)}
        />
        <p className="mds-caption" data-testid="homework-counts">
          {t("Homework.summary", counts)} · {t("Homework.zone", { zone })}
        </p>
      </div>
      {shown.map((session) => {
        const heading = t("Homework.sessionHeading", {
          week: session.weekNumber,
          title: session.title,
        });
        return (
          <section
            key={session.lessonId}
            className="flex flex-col gap-3"
            aria-labelledby={`homework-${session.lessonId}`}
            data-testid={`homework-${session.lessonId}`}
          >
            <div className="flex flex-col gap-1">
              <h2 id={`homework-${session.lessonId}`} className="mds-h2">
                <bdi>{heading}</bdi>
              </h2>
              <p
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
                data-testid={`homework-status-${session.lessonId}`}
              >
                {session.startsAt ? (
                  <time className="mds-caption" dateTime={session.startsAt}>
                    {whenLabel(
                      new Date(session.startsAt),
                      { locale, timeZone: courseTimeZone },
                      "short"
                    )}
                  </time>
                ) : null}
                {session.hasAssignment ? (
                  <Badge
                    variant="secondary"
                    icon={<Icon name="note" size="sm" />}
                  >
                    {t("Homework.hasAssignment")}
                  </Badge>
                ) : (
                  <Badge variant="outline">{t("Homework.noAssignment")}</Badge>
                )}
                {session.handIns ? (
                  <span className="mds-caption mds-num">
                    {t("Homework.handedIn", session.handIns)}
                  </span>
                ) : null}
              </p>
            </div>
            <Table
              caption={t("Homework.caption", { session: heading })}
              responsive="stack"
              columns={columns(heading)}
              rows={session.rows}
              rowKey={(row) => row.id}
              empty={t("Homework.sessionEmpty")}
            />
          </section>
        );
      })}
    </div>
  );
}

/** A talebe's note, cut short when it is long, with a button to read it whole. */
function NoteCell({ note }: { note: string }) {
  const t = useTranslations("nazar");
  const [open, setOpen] = useState(false);
  const excerpt = noteExcerpt(note);
  return (
    <span className="flex flex-col items-start gap-1">
      <span className="whitespace-pre-line break-words" dir="auto">
        {excerpt && !open ? excerpt : note.trim()}
      </span>
      {excerpt ? (
        <button
          type="button"
          className="mds-link mds-caption"
          aria-expanded={open}
          onClick={() => setOpen((now) => !now)}
        >
          {t(open ? "Homework.noteLess" : "Homework.noteMore")}
        </button>
      ) : null}
    </span>
  );
}
