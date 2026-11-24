"use client";

import type {
  KoskStudentListResponse,
  KoskStudentResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import {
  courseStudentsHref,
  pagerOf,
  SEARCH_MAX,
  studentsHref,
} from "../present";
import { ListFailed, ListPager } from "./list-parts";

interface Props {
  koskId: string;
  koskName: string;
  /** the search the address carries */
  q: string;
  /** null when the read failed */
  data: KoskStudentListResponse | null;
}

/**
 * Talebeler for a whole köşk (MDRS-211, the menu of nizam/52): everyone
 * enrolled in, or who completed, a course of the köşk, a row a person with
 * the courses they hold. Nothing is changed here: a course leads to its own
 * Talebeler (nizam/57), where a talebe is completed, removed or barred. The
 * one thing carried over from there is how many applications wait, with the
 * way to Başvurular. The search and the page are in the address; the search
 * is a plain form, so it works before the page's script has loaded.
 */
export function KoskStudentsView({ koskId, koskName, q, data }: Props) {
  const t = useTranslations("nizam.KoskLists");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const day = new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  const columns: TableColumn<KoskStudentResponse>[] = [
    {
      key: "student",
      header: t("students.columns.student"),
      rowHeader: true,
      width: "26%",
      render: (s) => {
        const name = s.name ?? s.email ?? t("students.unknown");
        return (
          <span className="flex min-w-0 items-center gap-3">
            <Avatar name={name} decorative />
            <bdi className="font-semibold">{name}</bdi>
          </span>
        );
      },
    },
    {
      key: "email",
      header: t("students.columns.email"),
      width: "24%",
      render: (s) =>
        s.email ? (
          <bdi dir="ltr" className="break-all">
            {s.email}
          </bdi>
        ) : (
          "—"
        ),
    },
    {
      key: "courses",
      header: t("students.columns.courses"),
      width: "34%",
      render: (s) => (
        <ul className="m-0 flex list-none flex-col gap-1 p-0">
          {s.courses.map((c) => (
            <li key={c.id} className="flex flex-wrap items-baseline gap-2">
              <a className="mds-link" href={courseStudentsHref(koskId, c.id)}>
                <bdi>{c.title}</bdi>
              </a>
              {c.status === "COMPLETED" ? (
                <span className="mds-caption">{t("students.completed")}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "since",
      header: t("students.columns.since"),
      width: "16%",
      render: (s) => (
        <time dateTime={new Date(s.firstEnrolledAt).toISOString()}>
          {day.format(new Date(s.firstEnrolledAt))}
        </time>
      ),
    },
  ];

  const pager = data
    ? pagerOf(data.page, data.limit, data.total, data.items.length)
    : null;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-students"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("students.title")}</h1>
        <p className="mds-reading m-0 max-w-[48rem]">
          {t("students.intro", { kosk: koskName })}
        </p>
      </header>

      {data === null || pager === null ? (
        <ListFailed
          title={t("students.loadFailedTitle")}
          href={studentsHref(koskId, q)}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {data.pendingCount > 0 ? (
            <Alert tone="info" title={t("students.pendingTitle")}>
              <p data-testid="kosk-students-pending">
                {t("students.pending", { count: data.pendingCount })}
              </p>
              <Button
                variant="outline"
                size="small"
                href={`/kosks/${koskId}/basvurular`}
              >
                {t("students.goToApplications")}
              </Button>
            </Alert>
          ) : null}

          <search>
            <form
              method="get"
              action={`/kosks/${koskId}/talebeler`}
              className="flex max-w-[32rem] flex-wrap items-end gap-2"
            >
              <span className="min-w-0 flex-1">
                <Input
                  type="search"
                  name="ara"
                  aria-label={t("students.searchLabel")}
                  placeholder={t("students.searchPlaceholder")}
                  leading={<Icon name="search" size="sm" />}
                  defaultValue={q}
                  maxLength={SEARCH_MAX}
                  autoComplete="off"
                />
              </span>
              <Button type="submit" variant="outline">
                {t("students.search")}
              </Button>
            </form>
          </search>

          <p className="mds-caption m-0" data-testid="kosk-students-total">
            {t("students.total", { count: data.total })}
          </p>
          {data.items.length === 0 ? (
            <EmptyState>
              {q ? t("students.emptyFiltered") : t("students.empty")}
            </EmptyState>
          ) : (
            <Table
              caption={t("students.caption", { kosk: koskName })}
              columns={columns}
              rows={data.items}
              rowKey={(s) => s.userId}
              responsive="stack"
            />
          )}
          <ListPager
            pager={pager}
            total={data.total}
            hrefOf={(page) => studentsHref(koskId, q, page)}
          />
        </div>
      )}
    </div>
  );
}
