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
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import {
  fromZonedDatetimeLocal,
  normalizeMeetingUrl,
  resolveMeetingPlatform,
  timeZoneCity,
  toZonedDatetimeLocal,
} from "@medaris/utils";
import { useRouter } from "next/navigation";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import { cancelSession, patchLesson } from "../actions";
import { formatInstant } from "../format";
import {
  courseErrorKey,
  groupSessions,
  linkProblem,
  type SessionRow,
  sessionRows,
} from "../present";

interface Props {
  kosk: { id: string; name: string };
  course: CourseDetailResponse;
  /** recordings per session id, for the past sessions */
  recordings: Record<string, number>;
  /** tedris's address, for the session titles; null when this deployment has none */
  tedrisUrl: string | null;
}

type Editing =
  | { kind: "link"; id: string; value: string }
  | { kind: "time"; id: string; date: string; time: string };

/** how many past sessions show before "N geçmiş celsenin tümü" */
const PAST_PREVIEW = 2;

/**
 * Celseler (nizam 56): every session of a course by date, "Yaklaşan" and
 * "Geçmiş". The state of a row follows the clock (live, planned, over) and the
 * cancellation; a link is added or replaced inline (https only), a time is
 * moved, and "İptal et" keeps the session in the programme marked cancelled.
 * Every write carries the course version the page last saw.
 */
export function SessionsView({
  kosk,
  course: serverCourse,
  recordings,
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

  // The clock is read in the browser and moves while the page is open.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);

  const zone = course.timeZone;
  const rows = sessionRows(course, now);
  const groups = groupSessions(rows, now);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState<SessionRow | null>(null);
  const [allPast, setAllPast] = useState(false);

  const base = `/${locale}/kosks/${kosk.id}`;
  const courseBase = `${base}/courses/${course.id}`;
  const refresh = () => startTransition(() => router.refresh());
  const counts = new Map(Object.entries(recordings));

  const fail = (errorBody: unknown) =>
    toast.error(t("failed"), {
      description: t(`errors.${courseErrorKey(errorBody)}` as never),
      duration: Number.POSITIVE_INFINITY,
    });

  const startLink = (row: SessionRow) => {
    setProblem(null);
    setEditing({ kind: "link", id: row.id, value: row.meetingUrl ?? "" });
  };
  const startTime = (row: SessionRow) => {
    setProblem(null);
    const [date = "", time = ""] = toZonedDatetimeLocal(row.start, zone).split(
      "T"
    );
    setEditing({ kind: "time", id: row.id, date, time: time.slice(0, 5) });
  };

  const saveEditing = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    let body: { version: number; meetingUrl?: string; scheduledAt?: Date };
    if (editing.kind === "link") {
      const url = normalizeMeetingUrl(editing.value);
      if (!url || linkProblem(editing.value)) {
        setProblem(t("errors.link"));
        return;
      }
      body = { version, meetingUrl: url };
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
    if (!result.success) {
      fail(result.errorBody);
      return;
    }
    setVersion(result.data.courseVersion);
    setEditing(null);
    toast.success(t(editing.kind === "link" ? "linkSaved" : "timeSaved"));
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

  const linkCell = (row: SessionRow) => {
    if (row.state === "cancelled") {
      return (
        <span>
          <span aria-hidden="true">—</span>
          <span className="mds-visually-hidden">{t("linkHidden")}</span>
        </span>
      );
    }
    if (!row.meetingUrl) {
      return <span className="text-neutral-muted">{t("linkMissing")}</span>;
    }
    const platform = resolveMeetingPlatform(row.meetingUrl);
    return platform.id === "unknown" ? (
      <bdi dir="ltr" className="mds-caption font-mono">
        {safeHost(row.meetingUrl)}
      </bdi>
    ) : (
      <PlatformChip platform={platform.id} />
    );
  };

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
      case "ended": {
        const n = counts.get(row.id) ?? 0;
        return (
          <span className="flex flex-col gap-1">
            <span>{t("state.ended")}</span>
            <span className="mds-caption">{t("recordings", { count: n })}</span>
          </span>
        );
      }
      default:
        return <Badge variant="secondary">{t("state.scheduled")}</Badge>;
    }
  };

  const sessionColumn: TableColumn<SessionRow> = {
    key: "session",
    header: t("columns.session"),
    rowHeader: true,
    width: "22%",
    render: nameCell,
  };
  const timeColumn: TableColumn<SessionRow> = {
    key: "time",
    header: t("columns.time"),
    width: "17%",
    render: timeCell,
  };
  const linkColumn: TableColumn<SessionRow> = {
    key: "link",
    header: t("columns.link"),
    width: "15%",
    render: linkCell,
  };
  const stateColumn: TableColumn<SessionRow> = {
    key: "state",
    header: t("columns.state"),
    width: "15%",
    render: statusCell,
  };
  const upcomingColumns: TableColumn<SessionRow>[] = [
    sessionColumn,
    timeColumn,
    linkColumn,
    stateColumn,
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "31%",
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
    linkColumn,
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
                  editing.kind === "link" ? "linkFormTitle" : "timeFormTitle",
                  {
                    when: formatInstant(format, target.start, zone, "full"),
                  }
                )}
              </h3>
              {editing.kind === "link" ? (
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

/** The host of a link for display; the link itself when it cannot be parsed. */
function safeHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
