"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn, type TableSort } from "@medaris/ui/mds/table";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { hiddenAtLabel } from "~/features/archive/present";
import {
  type ApplicationRow,
  actionLabel,
  type Messages,
  rowKey,
} from "../present";

/**
 * The table of waiting applications. `kosk` is the köşk's page (nizam 31:
 * talebe with the address under the name, the course, the date); `course` is
 * a course's tab (nizam 57: the address has a column of its own and there is
 * no course to name). Both end in Onayla and Reddet, and both name each button
 * by the talebe and the course ("Onayla: ad, ders").
 */
export function ApplicationsTable({
  variant,
  rows,
  caption,
  empty,
  busyKey,
  sort,
  onSortChange,
  onDecide,
}: {
  variant: "kosk" | "course";
  rows: ApplicationRow[];
  caption: string;
  empty: string;
  busyKey: string | null;
  sort: TableSort;
  onSortChange: (next: TableSort) => void;
  onDecide: (row: ApplicationRow, kind: "approve" | "reject") => void;
}) {
  const t = useTranslations("nizam.ApplicationsPage") as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const now = new Date();

  const when = (row: ApplicationRow) =>
    hiddenAtLabel(new Date(row.createdAt), now, { locale, timeZone, t });

  const email = (row: ApplicationRow) =>
    row.email ? (
      <bdi dir="ltr" title={row.email} className="block truncate font-mono">
        {row.email}
      </bdi>
    ) : null;

  const student: TableColumn<ApplicationRow> = {
    key: "student",
    header: t("columns.student"),
    rowHeader: true,
    width: variant === "kosk" ? "31%" : "30%",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar name={row.name} decorative />
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi className="font-semibold">{row.name}</bdi>
          {variant === "kosk" && row.email ? (
            <span className="mds-caption">{email(row)}</span>
          ) : null}
        </span>
      </span>
    ),
  };
  const course: TableColumn<ApplicationRow> = {
    key: "course",
    header: t("columns.course"),
    width: "33%",
    render: (row) => (
      <span className="flex min-w-0 items-center gap-3">
        <CoverPattern seed={row.courseId} size="xs" aria-hidden="true" />
        <span className="flex min-w-0 flex-1 flex-col">
          <bdi>{row.courseTitle}</bdi>
          {row.muderris.length > 0 ? (
            <bdi className="mds-caption">{row.muderris.join(", ")}</bdi>
          ) : null}
        </span>
      </span>
    ),
  };
  const mail: TableColumn<ApplicationRow> = {
    key: "email",
    header: t("columns.email"),
    width: "32%",
    render: (row) => <span className="mds-caption">{email(row)}</span>,
  };
  const date: TableColumn<ApplicationRow> = {
    key: "date",
    header: t("columns.date"),
    sortable: true,
    width: variant === "kosk" ? "18%" : "20%",
    render: (row) => (
      <time dateTime={row.createdAt} className="whitespace-nowrap">
        {when(row)}
      </time>
    ),
  };
  const actions: TableColumn<ApplicationRow> = {
    key: "actions",
    header: <span className="mds-visually-hidden">{t("columns.actions")}</span>,
    align: "right",
    width: "18%",
    render: (row) => {
      const busy = busyKey === rowKey(row);
      return (
        <span className="flex items-center justify-end gap-2">
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="check" size="sm" />}
            disabled={busy}
            aria-label={actionLabel("approve", row, t)}
            onClick={() => onDecide(row, "approve")}
          >
            {t("approve")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            disabled={busy}
            aria-label={actionLabel("reject", row, t)}
            onClick={() => onDecide(row, "reject")}
          >
            {t("reject")}
          </Button>
        </span>
      );
    },
  };

  return (
    <Table
      caption={caption}
      columns={
        variant === "kosk"
          ? [student, course, date, actions]
          : [student, mail, date, actions]
      }
      rows={rows}
      rowKey={(row) => rowKey(row)}
      empty={empty}
      sort={sort}
      onSortChange={onSortChange}
      responsive="stack"
    />
  );
}
