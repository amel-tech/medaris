"use client";

import type {
  DashboardSessionTab,
  KoskDashboardApplicationResponse,
  KoskDashboardResponse,
  KoskDashboardSessionResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { Stat } from "@medaris/ui/mds/stat";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  approveEnrollment,
  rejectEnrollment,
} from "~/features/kosks/actions/courses";
import { loadKoskSessions } from "../actions";
import {
  type Messages,
  momentLabel,
  muderrisLine,
  platformView,
  sessionAction,
  sessionState,
  sessionWhen,
  sessionWhenLong,
  weekLine,
} from "../present";
import { HomeSection } from "./home-parts";
import { RejectApplicationDialog } from "./reject-application-dialog";

interface Props {
  data: KoskDashboardResponse;
  /** the server's clock, so the server and the browser agree on "Bugün" */
  nowIso: string;
}

const TABS: DashboardSessionTab[] = ["UPCOMING", "PAST", "CANCELLED"];

/**
 * A köşk nazımı's home page (nizam 02): the greeting with the week's celse
 * count, the alert about a celse with no meeting link, the four numbers, the
 * Celseler card with its three tabs, the newest applications to answer on the
 * spot, and the müderrisler. One read feeds it; the other two tabs are read
 * when they are opened. "Onayla" answers at once; "Reddet" asks for a reason
 * that may be left empty.
 */
export function KoskHome({ data, nowIso }: Props) {
  const t = useTranslations("nizam.Dashboard") as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const zone = { locale, timeZone };
  const router = useRouter();
  const toaster = useToaster();
  const now = new Date(nowIso);
  const base = `/${locale}/kosks/${data.koskId}`;

  const [tab, setTab] = useState<DashboardSessionTab>(data.tab);
  const [sessions, setSessions] = useState(data.sessions);
  const [loading, setLoading] = useState(false);
  const [tabFailed, setTabFailed] = useState(false);
  // The tab the latest request is for: an answer that comes late for another tab is dropped.
  const wanted = useRef<DashboardSessionTab>(data.tab);

  const [applications, setApplications] = useState(data.latestApplications);
  const [pendingCount, setPendingCount] = useState(
    data.counts.pendingApplications
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [rejecting, setRejecting] =
    useState<KoskDashboardApplicationResponse | null>(null);

  const openTab = async (next: string) => {
    const value = next as DashboardSessionTab;
    setTab(value);
    wanted.current = value;
    if (value === data.tab) {
      setSessions(data.sessions);
      setTabFailed(false);
      return;
    }
    setLoading(true);
    setTabFailed(false);
    let result: Awaited<ReturnType<typeof loadKoskSessions>> | null = null;
    try {
      result = await loadKoskSessions(data.koskId, value);
    } catch {
      result = null;
    }
    if (wanted.current !== value) return;
    setLoading(false);
    if (!result?.success) {
      setTabFailed(true);
      setSessions([]);
      return;
    }
    setSessions(result.data.sessions);
  };

  const keyOf = (a: KoskDashboardApplicationResponse) =>
    `${a.courseId}:${a.userId}`;

  const settled = (a: KoskDashboardApplicationResponse) => {
    setApplications((rows) => rows.filter((r) => keyOf(r) !== keyOf(a)));
    setPendingCount((n) => Math.max(0, n - 1));
    // the sidebar's badge follows the server's count
    router.refresh();
  };

  const failure = (error: string) =>
    toaster.notify({
      tone: "error",
      title: t("applications.actionFailed"),
      description: error,
    });

  const approve = async (a: KoskDashboardApplicationResponse) => {
    setBusy(keyOf(a));
    let result: Awaited<ReturnType<typeof approveEnrollment>> | null = null;
    try {
      result = await approveEnrollment(data.koskId, a.courseId, a.userId);
    } catch {
      result = null;
    }
    setBusy(null);
    if (!result?.success) {
      failure(result?.error ?? t("applications.errorUnknown"));
      return;
    }
    toaster.notify({
      title: t("applications.approved"),
      description: t("applications.approvedBody", {
        name: a.studentName ?? t("unknownPerson"),
        course: a.courseTitle,
      }),
    });
    settled(a);
  };

  const reject = async (
    a: KoskDashboardApplicationResponse,
    reason: string
  ): Promise<boolean> => {
    let result: Awaited<ReturnType<typeof rejectEnrollment>> | null = null;
    try {
      result = await rejectEnrollment(
        data.koskId,
        a.courseId,
        a.userId,
        reason
      );
    } catch {
      result = null;
    }
    if (!result?.success) {
      failure(result?.error ?? t("applications.errorUnknown"));
      return false;
    }
    toaster.notify({
      title: t("applications.rejected"),
      description: t("applications.rejectedBody", {
        name: a.studentName ?? t("unknownPerson"),
        course: a.courseTitle,
      }),
    });
    settled(a);
    return true;
  };

  const greeting = data.greetingName
    ? t("greetingKosk", { name: data.greetingName })
    : t("greetingAnon");
  const weekSentence =
    data.counts.upcomingSessions === 0
      ? t("week.none")
      : data.missingLinkCount === 0
        ? t("week.some", { count: data.counts.upcomingSessions })
        : t("week.missing", {
            count: data.counts.upcomingSessions,
            missing: data.missingLinkCount,
          });

  const stateLabel = (s: KoskDashboardSessionResponse) =>
    t(`sessions.state.${sessionState(s, now)}`);

  const sessionColumns: TableColumn<KoskDashboardSessionResponse>[] = [
    {
      key: "course",
      header: t("sessions.columns.course"),
      rowHeader: true,
      width: "29%",
      render: (s) => (
        <span className="flex min-w-0 flex-col">
          <bdi className="font-semibold">{s.courseTitle}</bdi>
          <span className="mds-caption">
            {[
              weekLine(s, {
                week: (n) => t("sessions.week", { number: n }),
                makeup: t("sessions.makeup"),
              }),
              muderrisLine(s.muderris, t("sessions.imam")),
              s.madrasahName ?? "",
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      ),
    },
    {
      key: "when",
      header: t("sessions.columns.when"),
      width: "14%",
      render: (s) => <span>{sessionWhen(s.scheduledAt, zone)}</span>,
    },
    {
      key: "platform",
      header: t("sessions.columns.platform"),
      width: "13%",
      render: (s) => {
        const view = platformView(s.meetingUrl);
        return view ? (
          <PlatformChip platform={view.platform} host={view.host} />
        ) : (
          <span className="flex flex-col">
            <span aria-hidden="true">—</span>
            <span className="mds-caption">{t("sessions.noLink")}</span>
          </span>
        );
      },
    },
    {
      key: "students",
      header: t("sessions.columns.students"),
      align: "right",
      width: "7%",
      render: (s) => <span>{s.studentCount}</span>,
    },
    {
      key: "state",
      header: t("sessions.columns.state"),
      width: "13%",
      render: (s) => {
        const state = sessionState(s, now);
        return (
          <Badge variant={state === "missingLink" ? "warning" : "secondary"}>
            {stateLabel(s)}
          </Badge>
        );
      },
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("sessions.columns.actions")}
        </span>
      ),
      align: "right",
      width: "24%",
      render: (s) => {
        const action = sessionAction(sessionState(s, now));
        return (
          <Button
            variant="outline"
            size="small"
            href={`${base}/courses/${s.courseId}/sessions`}
            aria-label={t("sessions.actionLabel", {
              action: t(`sessions.action.${action}`),
              course: s.courseTitle,
              when: sessionWhen(s.scheduledAt, zone),
            })}
          >
            {t(`sessions.action.${action}`)}
          </Button>
        );
      },
    },
  ];

  const applicationColumns: TableColumn<KoskDashboardApplicationResponse>[] = [
    {
      key: "student",
      header: t("applications.columns.student"),
      rowHeader: true,
      width: "42%",
      render: (a) => (
        <span className="flex min-w-0 flex-col">
          <bdi>{a.studentName ?? t("unknownPerson")}</bdi>
          <bdi className="mds-caption">{a.courseTitle}</bdi>
        </span>
      ),
    },
    {
      key: "when",
      header: t("applications.columns.when"),
      width: "22%",
      render: (a) => (
        <span>
          {momentLabel(a.requestedAt, now, zone, {
            today: t("today"),
            yesterday: t("yesterday"),
          })}
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("applications.columns.actions")}
        </span>
      ),
      align: "right",
      width: "36%",
      render: (a) => {
        const name = a.studentName ?? t("unknownPerson");
        const disabled = busy === keyOf(a);
        return (
          <span className="flex flex-nowrap items-center justify-end gap-2">
            <Button
              variant="outline"
              size="small"
              loading={disabled}
              aria-label={t("applications.approveLabel", {
                name,
                course: a.courseTitle,
              })}
              onClick={() => void approve(a)}
            >
              {t("applications.approve")}
            </Button>
            <Button
              variant="ghost"
              size="small"
              disabled={disabled}
              aria-label={t("applications.rejectLabel", {
                name,
                course: a.courseTitle,
              })}
              onClick={() => setRejecting(a)}
            >
              {t("applications.reject")}
            </Button>
          </span>
        );
      },
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="home-kosk"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h1 className="mds-h1">{t("title")}</h1>
          <p data-testid="home-greeting">
            {greeting} {weekSentence}
          </p>
        </div>
        <Button
          href={`${base}/courses/new`}
          iconLeft={<Icon name="plus" size="sm" />}
        >
          {t("openCourse")}
        </Button>
      </header>

      {data.missingLinkCount > 0 && data.firstMissingLink ? (
        <Alert
          tone="warning"
          title={t("missingAlert.title", { count: data.missingLinkCount })}
        >
          <p data-testid="home-missing-link">
            {t("missingAlert.body", {
              course: data.firstMissingLink.courseTitle,
              when: sessionWhenLong(data.firstMissingLink.scheduledAt, zone),
              count: data.missingLinkCount,
            })}
          </p>
        </Alert>
      ) : null}

      <section
        aria-label={t("counts.koskTitle")}
        className="grid gap-grid sm:grid-cols-2 lg:grid-cols-4"
        data-testid="home-counts"
      >
        <Stat label={t("counts.course")} value={data.counts.courses} />
        <Stat label={t("counts.students")} value={data.counts.students} />
        <Stat
          label={t("counts.upcoming")}
          value={data.counts.upcomingSessions}
        />
        <Stat label={t("counts.pendingApplications")} value={pendingCount} />
      </section>

      <HomeSection
        id="home-sessions"
        title={t("sessions.title")}
        link={{ href: `${base}/celseler`, label: t("seeAll") }}
      >
        <Tabs
          tabs={TABS.map((value) => ({
            value,
            label: t(`sessions.tabs.${value}`),
            count:
              value === "UPCOMING"
                ? data.sessionCounts.upcoming
                : value === "PAST"
                  ? data.sessionCounts.past
                  : data.sessionCounts.cancelled,
          }))}
          value={tab}
          onChange={(v) => void openTab(v)}
          label={t("sessions.tabsLabel")}
        />
        {tab === "UPCOMING" ? (
          <p className="mds-caption">{t("sessions.upcomingNote")}</p>
        ) : null}
        {tabFailed ? (
          <Alert tone="error" title={t("sessions.loadFailedTitle")}>
            <p>{t("sessions.loadFailed")}</p>
            <Button
              variant="outline"
              size="small"
              onClick={() => void openTab(tab)}
            >
              {t("retry")}
            </Button>
          </Alert>
        ) : (
          <div aria-busy={loading} data-testid="home-sessions-table">
            <Table
              columns={sessionColumns}
              rows={loading ? [] : sessions}
              rowKey={(s) => s.id}
              caption={t(`sessions.caption.${tab}`)}
              empty={
                loading ? t("sessions.loading") : t(`sessions.empty.${tab}`)
              }
              responsive="stack"
            />
          </div>
        )}
      </HomeSection>

      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <HomeSection
          id="home-applications"
          title={t("applications.titleKosk")}
          link={{ href: `${base}/basvurular`, label: t("seeAll") }}
        >
          <Table
            columns={applicationColumns}
            rows={applications}
            rowKey={keyOf}
            caption={t("applications.caption")}
            empty={t("applications.emptyKosk")}
            responsive="stack"
          />
        </HomeSection>

        <HomeSection id="home-muderris" title={t("muderris.title")}>
          {data.muderris.length === 0 ? (
            <EmptyState>{t("muderris.empty")}</EmptyState>
          ) : (
            <ul
              className="mds-card m-0 flex list-none flex-col gap-0 p-0"
              data-testid="home-muderris-list"
            >
              {data.muderris.map((m) => (
                <li
                  key={m.userId ?? m.name}
                  className="flex items-center gap-3 border-be border-neutral-subtle p-card last:border-be-0"
                  data-testid="home-muderris-row"
                >
                  <Avatar name={m.name} decorative />
                  <span className="flex min-inline-0 flex-col gap-1">
                    <bdi className="font-semibold">{m.name}</bdi>
                    <span className="mds-caption">
                      {[
                        m.madrasahName ?? "",
                        t("muderris.courses", { count: m.courseCount }),
                        t("muderris.students", { count: m.studentCount }),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </HomeSection>
      </div>

      <RejectApplicationDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
        subject={
          rejecting
            ? `${rejecting.studentName ?? t("unknownPerson")} · ${rejecting.courseTitle}`
            : null
        }
        onSubmit={(reason) =>
          rejecting ? reject(rejecting, reason) : Promise.resolve(false)
        }
      />
    </div>
  );
}
