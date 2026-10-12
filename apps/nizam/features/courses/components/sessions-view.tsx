"use client";

import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import {
  fromZonedDatetimeLocal,
  normalizeMeetingUrl,
  normalizeYoutubeLiveUrl,
  timeZoneCity,
  toZonedDatetimeLocal,
} from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { redirectIfUnauthenticated } from "~/lib/unauthenticated";
import { cancelSession, patchLesson, setLiveStream } from "../actions";
import { formatInstant } from "../format";
import {
  courseErrorKey,
  groupSessions,
  type InPersonChoice,
  inPersonChoiceOf,
  inPersonOverrideOf,
  linkProblem,
  liveStreamProblem,
  liveStreamRefusal,
  rowAttendance,
  type SessionRow,
  sessionRows,
} from "../present";
import { AttendanceCell } from "./attendance-cell";

interface Props {
  kosk: { id: string; name: string };
  course: CourseDetailResponse;
  /**
   * recordings per session id, for the past sessions; null when they could
   * not be read, and then nothing is said of them
   */
  recordings: Record<string, number> | null;
  /**
   * The live stream link per session id (MDRS-228); `null` when the caller may
   * not set them, which leaves the stream buttons out.
   */
  liveStreams: Record<string, string> | null;
  /** tedris's address, for the session titles; null when this deployment has none */
  tedrisUrl: string | null;
}

type Editing =
  | { kind: "link"; id: string; value: string }
  | { kind: "stream"; id: string; value: string }
  | { kind: "inPerson"; id: string; value: InPersonChoice }
  | { kind: "time"; id: string; date: string; time: string };

/** how many past sessions show before "N geçmiş celsenin tümü" */
const PAST_PREVIEW = 2;

/**
 * Celseler (nizam 56): every session of a course by date, "Yaklaşan" and
 * "Geçmiş". The state of a row follows the clock (live, planned, over) and the
 * cancellation; a link is added or replaced inline (https only), a time is
 * moved, and "İptal et" keeps the session in the programme marked cancelled.
 * Every write carries the course version the page last saw.
 *
 * The live stream link (MDRS-228) is added, changed and removed the same way,
 * for whoever holds `session.live_link`. It is a YouTube video link, checked
 * here with the parser tedrisat runs; it carries no course version, since it
 * is no part of the course document.
 *
 * "Katılım" (MDRS-283) says how each session is attended, in nazar's words:
 * its meeting link, its live stream and the in-person mark, or "Eksik" for a
 * session still ahead with none of them. Whether there is a stream is read
 * from the course (`hasLiveStream`), so a caller who may not set the link sees
 * it too; a stream set or cleared on this page is laid over it until the page
 * is read again. "Yüz yüze ayarı" sets a session's own mark (follow the course,
 * in person, not in person) with the course version, like the link. A session
 * that is over says "Kaydı var" or "Kayıt yok" as plain words: nothing counts
 * a missing recording.
 */
export function SessionsView({
  kosk,
  course: serverCourse,
  recordings,
  liveStreams,
  tedrisUrl,
}: Props) {
  const t = useTranslations("nizam.Sessions");
  const format = useFormatter();
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const [course, setCourse] = useState(serverCourse);
  useEffect(() => setCourse(serverCourse), [serverCourse]);
  const [version, setVersion] = useState(serverCourse.version);
  useEffect(() => setVersion(serverCourse.version), [serverCourse.version]);
  const [streams, setStreams] = useState(liveStreams);
  useEffect(() => setStreams(liveStreams), [liveStreams]);
  // The streams this page set (true) or cleared (false), over the course read.
  const [streamWrites, setStreamWrites] = useState<Record<string, boolean>>({});
  useEffect(() => setStreamWrites({}), [serverCourse]);

  // The clock is read in the browser and moves while the page is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const zone = course.timeZone;
  const rows = sessionRows(course, now).map((row) => ({
    ...row,
    hasLiveStream: streamWrites[row.id] ?? row.hasLiveStream,
  }));
  const groups = groupSessions(rows, now);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<SessionRow | null>(null);
  const [allPast, setAllPast] = useState(false);

  const base = `/${locale}/kosks/${kosk.id}`;
  const courseBase = `${base}/courses/${course.id}`;
  const refresh = () => startTransition(() => router.refresh());
  const counts =
    recordings === null ? null : new Map(Object.entries(recordings));

  const fail = (errorBody: unknown) =>
    toast.error(t("failed"), {
      description: t(`errors.${courseErrorKey(errorBody)}` as never),
      duration: Number.POSITIVE_INFINITY,
    });

  const startLink = (row: SessionRow) => {
    setProblem(null);
    setEditing({ kind: "link", id: row.id, value: row.meetingUrl ?? "" });
  };
  const startStream = (row: SessionRow) => {
    setProblem(null);
    setEditing({ kind: "stream", id: row.id, value: streams?.[row.id] ?? "" });
  };
  const startTime = (row: SessionRow) => {
    setProblem(null);
    const [date = "", time = ""] = toZonedDatetimeLocal(row.start, zone).split(
      "T"
    );
    setEditing({ kind: "time", id: row.id, date, time: time.slice(0, 5) });
  };
  const startInPerson = (row: SessionRow) => {
    setProblem(null);
    setEditing({
      kind: "inPerson",
      id: row.id,
      value: inPersonChoiceOf(row.inPersonOverride),
    });
  };

  /** Sets the stream link, or clears it with `null`. */
  const writeStream = async (lessonId: string, url: string | null) => {
    setBusy(true);
    const result = await setLiveStream(kosk.id, course.id, lessonId, url);
    setBusy(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      const refusal = liveStreamRefusal(result.errorBody);
      if ("field" in refusal) {
        setProblem(t(`stream.problems.${refusal.field}`));
      } else {
        toast.error(t("failed"), {
          description: t(refusal.toast as never),
          duration: Number.POSITIVE_INFINITY,
        });
      }
      return;
    }
    const saved = result.data.liveStreamUrl;
    setStreams((current) => {
      const next = { ...current };
      if (saved) next[lessonId] = saved;
      else delete next[lessonId];
      return next;
    });
    setStreamWrites((current) => ({ ...current, [lessonId]: Boolean(saved) }));
    setEditing(null);
    toast.success(t(saved ? "stream.saved" : "stream.removed"));
    refresh();
  };

  const saveEditing = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (editing.kind === "stream") {
      const problemKey = liveStreamProblem(editing.value);
      const url = normalizeYoutubeLiveUrl(editing.value);
      if (problemKey || !url) {
        setProblem(t(`stream.problems.${problemKey ?? "noVideo"}`));
        return;
      }
      await writeStream(editing.id, url);
      return;
    }
    let body: {
      version: number;
      meetingUrl?: string;
      scheduledAt?: Date;
      inPersonOverride?: boolean | null;
    };
    if (editing.kind === "link") {
      const url = normalizeMeetingUrl(editing.value);
      if (!url || linkProblem(editing.value)) {
        setProblem(t("errors.link"));
        return;
      }
      body = { version, meetingUrl: url };
    } else if (editing.kind === "inPerson") {
      body = { version, inPersonOverride: inPersonOverrideOf(editing.value) };
    } else {
      const at =
        editing.date && editing.time
          ? fromZonedDatetimeLocal(`${editing.date}T${editing.time}`, zone)
          : null;
      if (!at) {
        setProblem(t("errors.time"));
        return;
      }
      body = { version, scheduledAt: at };
    }
    setBusy(true);
    const result = await patchLesson(kosk.id, course.id, editing.id, body);
    setBusy(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      fail(result.errorBody);
      return;
    }
    setVersion(result.data.courseVersion);
    setEditing(null);
    toast.success(
      t(
        editing.kind === "link"
          ? "linkSaved"
          : editing.kind === "inPerson"
            ? "inPerson.saved"
            : "timeSaved"
      )
    );
    refresh();
  };

  const confirmCancel = async () => {
    if (!cancelling) return;
    setBusy(true);
    const result = await cancelSession(
      kosk.id,
      course.id,
      cancelling.id,
      version
    );
    setBusy(false);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      fail(result.errorBody);
      return;
    }
    setVersion(result.data.courseVersion);
    toast.success(t("cancelledToast"), {
      description: t("cancelledBody", { name: cancelling.title }),
    });
    setCancelling(null);
    refresh();
  };

  const when = (row: SessionRow) =>
    formatInstant(format, row.start, zone, "short");

  const nameCell = (row: SessionRow) => (
    <span className="flex min-w-0 flex-col gap-1">
      {tedrisUrl ? (
        <a
          className="mds-link font-semibold"
          href={`${tedrisUrl}/${locale}/courses/${course.id}/sessions/${row.id}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <bdi>{row.title}</bdi>
        </a>
      ) : (
        <span className="font-semibold">
          <bdi>{row.title}</bdi>
        </span>
      )}
      <span className="mds-caption">{t("week", { n: row.weekNumber })}</span>
    </span>
  );

  const timeCell = (row: SessionRow) => (
    <span>
      {when(row)}{" "}
      <span className="mds-caption">
        · {t("minutes", { minutes: row.durationMinutes })}
      </span>
    </span>
  );

  const attendanceCell = (row: SessionRow) =>
    row.state === "cancelled" ? (
      <span>
        <span aria-hidden="true">—</span>
        <span className="mds-visually-hidden">{t("linkHidden")}</span>
      </span>
    ) : (
      <AttendanceCell view={rowAttendance(row)} />
    );

  const statusCell = (row: SessionRow) => {
    switch (row.state) {
      case "live":
        return (
          <span className="flex flex-col gap-1">
            <Badge variant="live">{t("state.live")}</Badge>
            <span className="mds-caption">
              {t("livePassed", { minutes: row.minutesLive ?? 0 })}
            </span>
          </span>
        );
      case "cancelled":
        return <Badge variant="outline">{t("state.cancelled")}</Badge>;
      case "ended":
        return (
          <span className="flex flex-col gap-1">
            <span>{t("state.ended")}</span>
            {counts === null ? null : (
              <span className="mds-caption" data-testid="recording-state">
                {t((counts.get(row.id) ?? 0) > 0 ? "recorded" : "notRecorded")}
              </span>
            )}
          </span>
        );
      default:
        return <Badge variant="secondary">{t("state.scheduled")}</Badge>;
    }
  };

  const sessionColumn: TableColumn<SessionRow> = {
    key: "session",
    header: t("columns.session"),
    rowHeader: true,
    width: "20%",
    render: nameCell,
  };
  const timeColumn: TableColumn<SessionRow> = {
    key: "time",
    header: t("columns.time"),
    width: "15%",
    render: timeCell,
  };
  const attendanceColumn: TableColumn<SessionRow> = {
    key: "attendance",
    header: t("attendance.column"),
    width: "20%",
    render: attendanceCell,
  };
  const stateColumn: TableColumn<SessionRow> = {
    key: "state",
    header: t("columns.state"),
    width: "13%",
    render: statusCell,
  };
  const upcomingColumns: TableColumn<SessionRow>[] = [
    sessionColumn,
    timeColumn,
    attendanceColumn,
    stateColumn,
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "32%",
      render: (row) =>
        row.state === "cancelled" ? (
          <span className="mds-visually-hidden">{t("noActions")}</span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-1">
            <Button
              variant="outline"
              size="small"
              aria-label={t(
                row.meetingUrl ? "updateLinkLabel" : "addLinkLabel",
                {
                  when: when(row),
                }
              )}
              onClick={() => startLink(row)}
            >
              {t(row.meetingUrl ? "updateLink" : "addLink")}
            </Button>
            {row.inPerson !== null ? (
              <Button
                variant="ghost"
                size="small"
                aria-label={t("inPerson.buttonLabel", { when: when(row) })}
                onClick={() => startInPerson(row)}
              >
                {t("inPerson.button")}
              </Button>
            ) : null}
            {streams !== null ? (
              <Button
                variant="outline"
                size="small"
                aria-label={t(
                  streams[row.id] ? "stream.updateLabel" : "stream.addLabel",
                  { when: when(row) }
                )}
                onClick={() => startStream(row)}
              >
                {t(streams[row.id] ? "stream.update" : "stream.add")}
              </Button>
            ) : null}
            {row.state === "scheduled" ? (
              <>
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={t("changeTimeLabel", { when: when(row) })}
                  onClick={() => startTime(row)}
                >
                  {t("changeTime")}
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={t("cancelLabel", { when: when(row) })}
                  onClick={() => setCancelling(row)}
                >
                  {t("cancel")}
                </Button>
              </>
            ) : null}
          </span>
        ),
    },
  ];

  const pastColumns: TableColumn<SessionRow>[] = [
    sessionColumn,
    timeColumn,
    attendanceColumn,
    stateColumn,
  ];

  const target = editing ? rows.find((r) => r.id === editing.id) : undefined;
  const pastShown = allPast ? groups.past : groups.past.slice(0, PAST_PREVIEW);

  return (
    <div
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      data-testid="sessions"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[48rem] flex-col gap-3">
          <Breadcrumb
            label={t("breadcrumbLabel")}
            items={[
              { label: t("breadcrumbRoot"), href: `${base}/dersler` },
              { label: course.title, href: courseBase },
              t("breadcrumbCurrent"),
            ]}
          />
          <h1 className="mds-h1">{t("title")}</h1>
          <p>
            {t("intro", {
              name: course.title,
              zone:
                zone === "Europe/Istanbul"
                  ? t("zoneIstanbul")
                  : timeZoneCity(zone),
            })}
          </p>
        </div>
        <Button
          href={`${courseBase}/sessions/new`}
          iconLeft={<Icon name="plus" size="sm" />}
        >
          {t("plan")}
        </Button>
      </header>

      {rows.length === 0 ? (
        <Alert tone="info" title={t("emptyTitle")}>
          <p>{t("emptyBody")}</p>
        </Alert>
      ) : null}

      {rows.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="s-up">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="s-up" className="mds-h2">
              {t("upcomingTitle")}
            </h2>
            <span className="mds-caption" data-testid="upcoming-counts">
              {[
                t("count", { count: groups.upcoming.length }),
                groups.cancelledUpcoming > 0
                  ? t("cancelledCount", { count: groups.cancelledUpcoming })
                  : null,
                groups.weekRange
                  ? t("weekRange", { range: groups.weekRange })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <Table
            caption={t("upcomingTitle")}
            responsive="stack"
            columns={upcomingColumns}
            rows={groups.upcoming}
            rowKey={(r) => r.id}
            empty={t("upcomingEmpty")}
          />
          {editing && target ? (
            <form
              className="mds-card flex flex-col gap-3"
              onSubmit={saveEditing}
              noValidate
              data-testid="session-edit"
            >
              <h3 className="mds-h3">
                {t(
                  editing.kind === "link"
                    ? "linkFormTitle"
                    : editing.kind === "stream"
                      ? "stream.formTitle"
                      : editing.kind === "inPerson"
                        ? "inPerson.formTitle"
                        : "timeFormTitle",
                  {
                    when: formatInstant(format, target.start, zone, "full"),
                  }
                )}
              </h3>
              {editing.kind === "stream" ? (
                <Field
                  label={t("stream.formLabel")}
                  help={t("stream.formHelp")}
                  error={problem ?? undefined}
                >
                  <Input
                    mono
                    name="liveStreamUrl"
                    placeholder="https://studio.youtube.com/video/…"
                    autoComplete="off"
                    spellCheck={false}
                    value={editing.value}
                    onChange={(e) =>
                      setEditing({ ...editing, value: e.target.value })
                    }
                  />
                </Field>
              ) : editing.kind === "inPerson" ? (
                <RadioGroup
                  legend={t("inPerson.legend")}
                  name="inPerson"
                  bordered
                  value={editing.value}
                  onChange={(value) =>
                    setEditing({ ...editing, value: value as InPersonChoice })
                  }
                  options={[
                    {
                      value: "course",
                      label: t("inPerson.course"),
                      description: t(
                        course.inPerson
                          ? "inPerson.courseYes"
                          : "inPerson.courseNo"
                      ),
                    },
                    { value: "yes", label: t("inPerson.yes") },
                    { value: "no", label: t("inPerson.no") },
                  ]}
                />
              ) : editing.kind === "link" ? (
                <Field
                  label={t("linkFormLabel")}
                  help={t("linkFormHelp")}
                  error={problem ?? undefined}
                >
                  <Input
                    mono
                    name="meetingUrl"
                    placeholder="https://zoom.us/j/…"
                    autoComplete="off"
                    spellCheck={false}
                    value={editing.value}
                    onChange={(e) =>
                      setEditing({ ...editing, value: e.target.value })
                    }
                  />
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t("dateLabel")}
                    required
                    error={problem ?? undefined}
                  >
                    <Input
                      type="date"
                      name="date"
                      value={editing.date}
                      onChange={(e) =>
                        setEditing({ ...editing, date: e.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("timeLabel")} required>
                    <Input
                      type="time"
                      name="time"
                      value={editing.time}
                      onChange={(e) =>
                        setEditing({ ...editing, time: e.target.value })
                      }
                    />
                  </Field>
                </div>
              )}
              <div className="flex items-center justify-end gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  {t("formCancel")}
                </Button>
                {editing.kind === "stream" && streams?.[editing.id] ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void writeStream(editing.id, null)}
                  >
                    {t("stream.remove")}
                  </Button>
                ) : null}
                <Button type="submit" loading={busy}>
                  {t("formSave")}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {groups.past.length > 0 ? (
        <section className="flex flex-col gap-3" aria-labelledby="s-past">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="s-past" className="mds-h2">
              {t("pastTitle")}
            </h2>
            {groups.past.length > PAST_PREVIEW ? (
              <button
                type="button"
                className="mds-link"
                aria-expanded={allPast}
                onClick={() => setAllPast((v) => !v)}
              >
                {allPast
                  ? t("pastFewer")
                  : t("pastAll", { count: groups.past.length })}
              </button>
            ) : null}
          </div>
          <Table
            caption={t("pastTitle")}
            responsive="stack"
            columns={pastColumns}
            rows={pastShown}
            rowKey={(r) => r.id}
          />
        </section>
      ) : null}

      <AlertDialog
        open={cancelling !== null}
        onOpenChange={(next) => {
          if (!busy && !next) setCancelling(null);
        }}
        eyebrow={cancelling?.title}
        title={t("cancelTitle")}
        confirmLabel={t("cancelConfirm")}
        cancelLabel={t("formCancel")}
        closeLabel={t("close")}
        confirmLoading={busy}
        onConfirm={() => void confirmCancel()}
      >
        <p>
          {t("cancelBody", {
            when: cancelling
              ? formatInstant(format, cancelling.start, zone, "full")
              : "",
          })}
        </p>
        <p className="mds-caption">{t("cancelWay")}</p>
      </AlertDialog>
    </div>
  );
}
