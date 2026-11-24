"use client";

import type {
  KoskSessionListResponse,
  KoskSessionRowResponse,
} from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs } from "@medaris/ui/mds/tabs";
import {
  useFormatter,
  useLocale,
  useTimeZone,
  useTranslations,
} from "next-intl";
import { formatInstant } from "~/features/courses/format";
import {
  courseSessionsHref,
  pagerOf,
  type SessionTab,
  sessionState,
  sessionsHref,
} from "../present";
import { ListFailed, ListPager } from "./list-parts";

interface Props {
  koskId: string;
  koskName: string;
  tab: SessionTab;
  /** null when the read failed */
  data: KoskSessionListResponse | null;
}

const STATE_VARIANT = {
  cancelled: "error",
  ended: "secondary",
  scheduled: "info",
} as const;

/**
 * Celseler for a whole köşk (MDRS-211, the menu of nizam/52): every course's
 * live sessions in one list, the ones still to come and the ones that are
 * over, by date, each with its course. Nothing is changed here: a row leads
 * to the course's own Celseler (nizam/56), where a session is planned, moved,
 * cancelled and given its link. The tab and the page are in the address.
 */
export function KoskSessionsView({ koskId, koskName, tab, data }: Props) {
  const t = useTranslations("nizam.KoskLists");
  const format = useFormatter();
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const columns: TableColumn<KoskSessionRowResponse>[] = [
    {
      key: "session",
      header: t("sessions.columns.session"),
      rowHeader: true,
      width: "34%",
      render: (s) => (
        <span className="flex min-w-0 flex-col gap-1">
          <bdi className="font-semibold">{s.title}</bdi>
          <span className="mds-caption">{t("week", { n: s.weekNumber })}</span>
        </span>
      ),
    },
    {
      key: "course",
      header: t("sessions.columns.course"),
      width: "28%",
      render: (s) => (
        <span className="flex min-w-0 flex-col gap-1">
          <a
            className="mds-link"
            href={courseSessionsHref(koskId, s.courseId)}
            aria-label={t("sessions.goToCourse", { course: s.courseTitle })}
          >
            <bdi>{s.courseTitle}</bdi>
          </a>
          {s.madrasahName ? (
            <bdi className="mds-caption">{s.madrasahName}</bdi>
          ) : null}
        </span>
      ),
    },
    {
      key: "time",
      header: t("sessions.columns.time"),
      width: "22%",
      render: (s) => (
        <span className="flex flex-col gap-1">
          <time dateTime={new Date(s.scheduledAt).toISOString()}>
            {formatInstant(format, new Date(s.scheduledAt), timeZone, "short")}
          </time>
          {s.durationMinutes ? (
            <span className="mds-caption">
              {t("minutes", { minutes: s.durationMinutes })}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "state",
      header: t("sessions.columns.state"),
      width: "16%",
      render: (s) => {
        const state = sessionState(s, tab);
        return (
          <span className="flex flex-wrap items-center gap-2">
            <Badge variant={STATE_VARIANT[state]}>
              {t(`sessions.state.${state}`)}
            </Badge>
            {s.inPerson ? (
              <Badge variant="outline">{t("sessions.inPerson")}</Badge>
            ) : null}
          </span>
        );
      },
    },
  ];

  const pager = data
    ? pagerOf(data.page, data.limit, data.total, data.items.length)
    : null;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-sessions"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("sessions.title")}</h1>
        <p className="mds-reading m-0 max-w-[48rem]">
          {t("sessions.intro", { kosk: koskName })}
        </p>
      </header>

      {data === null || pager === null ? (
        <ListFailed
          title={t("sessions.loadFailedTitle")}
          href={sessionsHref(koskId, tab)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Tabs
            mode="links"
            label={t("sessions.tabsLabel")}
            locale={locale}
            value={tab}
            tabs={[
              {
                value: "UPCOMING",
                label: t("sessions.tabs.UPCOMING"),
                count: data.upcomingCount,
                href: sessionsHref(koskId, "UPCOMING"),
              },
              {
                value: "PAST",
                label: t("sessions.tabs.PAST"),
                count: data.pastCount,
                href: sessionsHref(koskId, "PAST"),
              },
            ]}
          />
          {data.items.length === 0 ? (
            <EmptyState>{t(`sessions.empty.${tab}`)}</EmptyState>
          ) : (
            <Table
              caption={t(`sessions.caption.${tab}`, { kosk: koskName })}
              columns={columns}
              rows={data.items}
              rowKey={(s) => s.id}
              responsive="stack"
            />
          )}
          <ListPager
            pager={pager}
            total={data.total}
            hrefOf={(page) => sessionsHref(koskId, tab, page)}
          />
        </div>
      )}
    </div>
  );
}
