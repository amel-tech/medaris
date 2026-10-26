"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { normalizeYoutubeLiveUrl } from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type FormEvent,
  type MouseEvent,
  useEffect,
  useState,
  useTransition,
} from "react";
import { dayMonthClock } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { ReleaseDialog } from "../../recordings/components/release-dialog";
import { opensAt } from "../../recordings/recordings";
import { changeSession, setLiveStream } from "../actions";
import {
  courseMoved,
  fieldsOf,
  groupSessions,
  type InPersonChoice,
  inPersonChoiceOf,
  inPersonOverrideOf,
  instantOf,
  liveStreamProblem,
  rowAttendance,
  type SessionFact,
  type SessionRow,
  sendableLink,
  sessionErrorKey,
  sessionRows,
  whenLabel,
} from "../sessions";
import { AttendanceCell } from "./attendance-cell";
import { CancelDialog } from "./cancel-dialog";

type Editing =
  | { kind: "link"; id: string; value: string }
  | { kind: "stream"; id: string; value: string }
  | { kind: "inPerson"; id: string; value: InPersonChoice }
  | { kind: "time"; id: string; date: string; time: string };

/** How many past sessions show before "N geçmiş celsenin tümü". */
const PAST_PREVIEW = 2;

/**
 * The tables of Celseler. The state of a row follows the clock (live, planned,
 * over) and the cancellation, so the clock is read here and moves while the
 * page is open. A link is added or replaced inline (https only), a time is
 * moved on the viewer's clock, and "İptal et" keeps the session in the
 * programme marked cancelled and can add its make-up, which the cancelled
 * session then links to. Link, time, cancel, make-up and the in-person mark
 * are `session.manage` (`canManage`). The live stream link is set the same
 * way, for whoever holds `session.live_link`: `streams` is null when the
 * caller does not hold it or the page could not read the links, which leaves
 * its buttons out. A hidden button is not the check: every write carries the
 * course version the page last saw, and a refusal is worded from the API's
 * code.
 *
 * "Katılım" (MDRS-283) says how each session is attended: its meeting link,
 * its live stream and the in-person mark, or "Eksik" for a session still
 * ahead with none of them. Whether there is a stream is read from the course
 * (`hasLiveStream`), so a caller without `session.live_link` sees it too; a
 * stream set or cleared on this page is laid over it until the page is read
 * again. A session that is over says "Kayıt yok" when the course holds no
 * recording of it, as plain words: nothing counts it (`recorded` is null when
 * the recordings could not be read, and then nothing is said).
 *
 * "Kayıt erişimi" (MDRS-288) sets when talebe may watch a session's
 * recording, before it exists, for a holder of `recording.manage`
 * (`canRelease`): the dialog Ders kayıtları opens from its rows, on the
 * course's clock. A time still ahead is said under the row's state.
 */
export function SessionsTable({
  courseId,
  version: serverVersion,
  facts,
  canManage,
  streams: serverStreams,
  courseInPerson,
  recorded,
  releases,
  canRelease,
  locale,
  timeZone,
  courseTimeZone,
}: {
  courseId: string;
  version: number;
  facts: SessionFact[];
  /** the caller holds `session.manage` in this course */
  canManage: boolean;
  streams: Record<string, string> | null;
  /** "Celseler yüz yüze yapılır": what a session without its own mark follows */
  courseInPerson: boolean;
  /** the ids of the sessions that hold a recording; null when they could not be read */
  recorded: string[] | null;
  /** when talebe may watch each session's recording, as `{ lessonId: ISO time }` */
  releases: Record<string, string>;
  /** the caller holds `recording.manage` in this course */
  canRelease: boolean;
  locale: string;
  /** the viewer's zone, which the sessions' times are written in */
  timeZone: string;
  /** the course's zone, which the release times are typed and written in */
  courseTimeZone: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [, startTransition] = useTransition();

  const [version, setVersion] = useState(serverVersion);
  useEffect(() => setVersion(serverVersion), [serverVersion]);
  const [streams, setStreams] = useState(serverStreams);
  useEffect(() => setStreams(serverStreams), [serverStreams]);
  // The streams this page set (true) or cleared (false), over the course read.
  const [streamWrites, setStreamWrites] = useState<Record<string, boolean>>({});
  useEffect(() => setStreamWrites({}), [facts]);

  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const rows = sessionRows(
    facts.map((fact) => ({
      ...fact,
      hasLiveStream: streamWrites[fact.id] ?? fact.hasLiveStream,
    })),
    now
  );
  const recordedIds = recorded === null ? null : new Set(recorded);
  const groups = groupSessions(rows, now);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<SessionRow | null>(null);
  const [releasing, setReleasing] = useState<SessionRow | null>(null);
  const [allPast, setAllPast] = useState(false);

  const refresh = () => startTransition(() => router.refresh());
  const when = (row: SessionRow) =>
    whenLabel(row.start, { locale, timeZone }, "short");
  const fullWhen = (row: SessionRow) =>
    whenLabel(row.start, { locale, timeZone }, "full");

  /** A refused write: its sentence in a toast, and the page read again when the course moved. */
  const refuse = (code: string) => {
    notify({
      tone: "error",
      title: t("Sessions.failed"),
      description: words(sessionErrorKey(code)),
    });
    if (courseMoved(code)) refresh();
  };

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
    setEditing({ kind: "time", id: row.id, ...fieldsOf(row.start, timeZone) });
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
    const result = await setLiveStream(lessonId, url);
    if (handleUnauthenticated(result)) return;
    setBusy(false);
    if (!result.success) {
      refuse(result.code);
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
    notify({
      title: t(saved ? "Sessions.stream.saved" : "Sessions.stream.removed"),
    });
    refresh();
  };

  const saveEditing = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    if (editing.kind === "stream") {
      const problemKey = liveStreamProblem(editing.value);
      const url = normalizeYoutubeLiveUrl(editing.value);
      if (problemKey || !url) {
        setProblem(t(`Sessions.stream.problems.${problemKey ?? "noVideo"}`));
        return;
      }
      await writeStream(editing.id, url);
      return;
    }
    let change: Parameters<typeof changeSession>[1];
    if (editing.kind === "link") {
      const url = sendableLink(editing.value);
      if (!url) {
        setProblem(t("Sessions.errors.link"));
        return;
      }
      change = { version, meetingUrl: url };
    } else if (editing.kind === "inPerson") {
      change = { version, inPersonOverride: inPersonOverrideOf(editing.value) };
    } else {
      const at = instantOf(editing.date, editing.time, timeZone);
      if (!at) {
        setProblem(t("Sessions.errors.time"));
        return;
      }
      change = { version, scheduledAt: at.toISOString() };
    }
    setBusy(true);
    const result = await changeSession(editing.id, change);
    if (handleUnauthenticated(result)) return;
    setBusy(false);
    if (!result.success) {
      refuse(result.code);
      return;
    }
    setVersion(result.data.courseVersion);
    setEditing(null);
    notify({
      title: t(
        editing.kind === "link"
          ? "Sessions.linkSaved"
          : editing.kind === "inPerson"
            ? "Sessions.inPerson.saved"
            : "Sessions.timeSaved"
      ),
    });
    refresh();
  };

  const nameCell = (row: SessionRow) => (
    <span
      className="flex min-inline-0 flex-col gap-1"
      id={sessionAnchor(row.id)}
      tabIndex={-1}
    >
      <span className="font-semibold">
        <bdi>{row.title}</bdi>
      </span>
      <span className="mds-caption">
        {t("Sessions.week", { n: row.weekNumber })}
        {row.isMakeUp ? ` · ${t("Sessions.makeUp")}` : ""}
      </span>
    </span>
  );

  /** The session a cancelled one is made up by, opened even when it sits in the folded past. */
  const showSession = (event: MouseEvent, id: string) => {
    event.preventDefault();
    if (groups.past.some((row) => row.id === id)) setAllPast(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(sessionAnchor(id));
      target?.scrollIntoView({ block: "center" });
      target?.focus({ preventScroll: true });
    });
  };

  const timeCell = (row: SessionRow) => (
    <span>
      <time dateTime={row.startsAt}>{when(row)}</time>{" "}
      <span className="mds-caption">
        · {t("Sessions.minutes", { minutes: row.durationMinutes })}
      </span>
    </span>
  );

  const hidden = (
    <span>
      <span aria-hidden="true">—</span>
      <span className="mds-visually-hidden">{t("Sessions.linkHidden")}</span>
    </span>
  );

  const attendanceCell = (row: SessionRow) => {
    if (row.state === "cancelled") return hidden;
    const view = rowAttendance(row);
    return view ? (
      <AttendanceCell view={view} />
    ) : (
      <span>
        <span aria-hidden="true">—</span>
        <span className="mds-visually-hidden">
          {t("Sessions.attendance.unknown")}
        </span>
      </span>
    );
  };

  /** "Kayıt 14 Ekim 20:00’de açılır", while the session's release time is ahead, and never before its start. */
  const releaseNote = (row: SessionRow) => {
    const held = releases[row.id];
    const at = held ? opensAt(held, row.startsAt) : null;
    if (!at || at <= now) return null;
    return (
      <span className="mds-caption" data-testid="release-note">
        {t("Sessions.release.opens", {
          when: dayMonthClock(at, locale, courseTimeZone),
        })}
      </span>
    );
  };

  const stateOf = (row: SessionRow) => {
    switch (row.state) {
      case "live":
        return (
          <span className="flex flex-col gap-1">
            <Badge variant="live">{t("Sessions.state.live")}</Badge>
            <span className="mds-caption">
              {t("Sessions.livePassed", { minutes: row.minutesLive ?? 0 })}
            </span>
          </span>
        );
      case "cancelled": {
        const madeUpBy = row.replacementId
          ? rows.find((other) => other.id === row.replacementId)
          : undefined;
        return (
          <span className="flex flex-col gap-1">
            <Badge variant="outline">{t("Sessions.state.cancelled")}</Badge>
            {madeUpBy ? (
              <a
                className="mds-link mds-caption"
                href={`#${sessionAnchor(madeUpBy.id)}`}
                onClick={(event) => showSession(event, madeUpBy.id)}
              >
                {t("Sessions.madeUpBy", { when: when(madeUpBy) })}
              </a>
            ) : null}
          </span>
        );
      }
      case "ended":
        return (
          <span className="flex flex-col gap-1">
            <span>{t("Sessions.state.ended")}</span>
            {recordedIds === null ? null : (
              <span className="mds-caption" data-testid="recording-state">
                {t(
                  recordedIds.has(row.id)
                    ? "Sessions.recorded"
                    : "Sessions.notRecorded"
                )}
              </span>
            )}
          </span>
        );
      default:
        return (
          <Badge variant="secondary">{t("Sessions.state.scheduled")}</Badge>
        );
    }
  };

  const stateCell = (row: SessionRow) => {
    const note = row.state === "cancelled" ? null : releaseNote(row);
    return note ? (
      <span className="flex flex-col gap-1">
        {stateOf(row)}
        {note}
      </span>
    ) : (
      stateOf(row)
    );
  };

  const sessionColumn: TableColumn<SessionRow> = {
    key: "session",
    header: t("Sessions.columns.session"),
    rowHeader: true,
    width: "20%",
    render: nameCell,
  };
  const timeColumn: TableColumn<SessionRow> = {
    key: "time",
    header: t("Sessions.columns.time"),
    width: "15%",
    render: timeCell,
  };
  const attendanceColumn: TableColumn<SessionRow> = {
    key: "attendance",
    header: t("Sessions.attendance.column"),
    width: "20%",
    render: attendanceCell,
  };
  const stateColumn: TableColumn<SessionRow> = {
    key: "state",
    header: t("Sessions.columns.state"),
    width: "13%",
    render: stateCell,
  };

  const upcomingColumns: TableColumn<SessionRow>[] = [
    sessionColumn,
    timeColumn,
    attendanceColumn,
    stateColumn,
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Sessions.columns.actions")}
        </span>
      ),
      align: "right",
      width: "32%",
      render: (row) =>
        row.state === "cancelled" ||
        (!canManage && streams === null && !canRelease) ? (
          <span className="mds-visually-hidden">{t("Sessions.noActions")}</span>
        ) : (
          <span className="flex flex-wrap items-center justify-end gap-1">
            {canManage ? (
              <Button
                variant="outline"
                size="small"
                aria-label={t(
                  row.meetingUrl
                    ? "Sessions.updateLinkLabel"
                    : "Sessions.addLinkLabel",
                  { when: when(row) }
                )}
                onClick={() => startLink(row)}
              >
                {t(row.meetingUrl ? "Sessions.updateLink" : "Sessions.addLink")}
              </Button>
            ) : null}
            {canManage && row.inPerson !== null ? (
              <Button
                variant="ghost"
                size="small"
                aria-label={t("Sessions.inPerson.buttonLabel", {
                  when: when(row),
                })}
                onClick={() => startInPerson(row)}
              >
                {t("Sessions.inPerson.button")}
              </Button>
            ) : null}
            {streams !== null ? (
              <Button
                variant="outline"
                size="small"
                aria-label={t(
                  streams[row.id]
                    ? "Sessions.stream.updateLabel"
                    : "Sessions.stream.addLabel",
                  { when: when(row) }
                )}
                onClick={() => startStream(row)}
              >
                {t(
                  streams[row.id]
                    ? "Sessions.stream.update"
                    : "Sessions.stream.add"
                )}
              </Button>
            ) : null}
            {canRelease ? (
              <Button
                variant="ghost"
                size="small"
                aria-label={t("Sessions.release.buttonLabel", {
                  when: when(row),
                })}
                onClick={() => setReleasing(row)}
              >
                {t("Sessions.release.button")}
              </Button>
            ) : null}
            {canManage && row.state === "scheduled" ? (
              <>
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={t("Sessions.changeTimeLabel", {
                    when: when(row),
                  })}
                  onClick={() => startTime(row)}
                >
                  {t("Sessions.changeTime")}
                </Button>
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={t("Sessions.cancelLabel", { when: when(row) })}
                  onClick={() => setCancelling(row)}
                >
                  {t("Sessions.cancel")}
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

  const target = editing
    ? rows.find((row) => row.id === editing.id)
    : undefined;
  const pastShown = allPast ? groups.past : groups.past.slice(0, PAST_PREVIEW);

  return (
    <div className="flex flex-col gap-6" data-testid="sessions">
      {rows.length === 0 ? (
        <Alert tone="info" title={t("Sessions.emptyTitle")}>
          <p>{t("Sessions.emptyBody")}</p>
        </Alert>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="sessions-up">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sessions-up" className="mds-h2">
              {t("Sessions.upcomingTitle")}
            </h2>
            <span className="mds-caption" data-testid="upcoming-counts">
              {[
                t("Sessions.count", { count: groups.upcoming.length }),
                groups.cancelledUpcoming > 0
                  ? t("Sessions.cancelledCount", {
                      count: groups.cancelledUpcoming,
                    })
                  : null,
                groups.weekRange
                  ? t("Sessions.weekRange", { range: groups.weekRange })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <Table
            caption={t("Sessions.upcomingTitle")}
            responsive="stack"
            columns={upcomingColumns}
            rows={groups.upcoming}
            rowKey={(row) => row.id}
            empty={t("Sessions.upcomingEmpty")}
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
                    ? "Sessions.linkFormTitle"
                    : editing.kind === "stream"
                      ? "Sessions.stream.formTitle"
                      : editing.kind === "inPerson"
                        ? "Sessions.inPerson.formTitle"
                        : "Sessions.timeFormTitle",
                  { when: fullWhen(target) }
                )}
              </h3>
              {editing.kind === "stream" ? (
                <Field
                  label={t("Sessions.stream.formLabel")}
                  help={t("Sessions.stream.formHelp")}
                  error={problem ?? undefined}
                >
                  <Input
                    mono
                    name="liveStreamUrl"
                    placeholder="https://studio.youtube.com/video/…"
                    autoComplete="off"
                    spellCheck={false}
                    value={editing.value}
                    onChange={(event) =>
                      setEditing({ ...editing, value: event.target.value })
                    }
                  />
                </Field>
              ) : editing.kind === "inPerson" ? (
                <RadioGroup
                  legend={t("Sessions.inPerson.legend")}
                  name="inPerson"
                  bordered
                  value={editing.value}
                  onChange={(value) =>
                    setEditing({ ...editing, value: value as InPersonChoice })
                  }
                  options={[
                    {
                      value: "course",
                      label: t("Sessions.inPerson.course"),
                      description: t(
                        courseInPerson
                          ? "Sessions.inPerson.courseYes"
                          : "Sessions.inPerson.courseNo"
                      ),
                    },
                    { value: "yes", label: t("Sessions.inPerson.yes") },
                    { value: "no", label: t("Sessions.inPerson.no") },
                  ]}
                />
              ) : editing.kind === "link" ? (
                <Field
                  label={t("Sessions.linkFormLabel")}
                  help={t("Sessions.linkFormHelp")}
                  error={problem ?? undefined}
                >
                  <Input
                    mono
                    name="meetingUrl"
                    placeholder="https://zoom.us/j/…"
                    autoComplete="off"
                    spellCheck={false}
                    value={editing.value}
                    onChange={(event) =>
                      setEditing({ ...editing, value: event.target.value })
                    }
                  />
                </Field>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field
                    label={t("Sessions.dateLabel")}
                    required
                    error={problem ?? undefined}
                  >
                    <Input
                      type="date"
                      name="date"
                      value={editing.date}
                      onChange={(event) =>
                        setEditing({ ...editing, date: event.target.value })
                      }
                    />
                  </Field>
                  <Field label={t("Sessions.timeLabel")} required>
                    <Input
                      type="time"
                      name="time"
                      value={editing.time}
                      onChange={(event) =>
                        setEditing({ ...editing, time: event.target.value })
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
                  {t("Sessions.formCancel")}
                </Button>
                {editing.kind === "stream" && streams?.[editing.id] ? (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void writeStream(editing.id, null)}
                  >
                    {t("Sessions.stream.remove")}
                  </Button>
                ) : null}
                <Button type="submit" loading={busy}>
                  {t("Sessions.formSave")}
                </Button>
              </div>
            </form>
          ) : null}
        </section>
      )}

      {groups.past.length > 0 ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="sessions-past"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="sessions-past" className="mds-h2">
              {t("Sessions.pastTitle")}
            </h2>
            {groups.past.length > PAST_PREVIEW ? (
              <button
                type="button"
                className="mds-link"
                aria-expanded={allPast}
                onClick={() => setAllPast((value) => !value)}
              >
                {allPast
                  ? t("Sessions.pastFewer")
                  : t("Sessions.pastAll", { count: groups.past.length })}
              </button>
            ) : null}
          </div>
          <Table
            caption={t("Sessions.pastTitle")}
            responsive="stack"
            columns={pastColumns}
            rows={pastShown}
            rowKey={(row) => row.id}
          />
        </section>
      ) : null}

      {cancelling ? (
        <CancelDialog
          row={cancelling}
          courseId={courseId}
          version={version}
          locale={locale}
          timeZone={timeZone}
          onClose={() => setCancelling(null)}
          onVersion={setVersion}
          onDone={refresh}
        />
      ) : null}
      {releasing ? (
        <ReleaseDialog
          key={releasing.id}
          lessonId={releasing.id}
          session={fullWhen(releasing)}
          held={releases[releasing.id] ?? null}
          startsAt={releasing.startsAt}
          timeZone={courseTimeZone}
          onClose={() => setReleasing(null)}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}

/** The id a session's row carries, for the link from the session it makes up for. */
const sessionAnchor = (id: string): string => `celse-${id}`;
