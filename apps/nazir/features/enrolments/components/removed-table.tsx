"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useTranslations } from "next-intl";
import type { RemovedRow } from "../enrolments";

/**
 * "Erişimi kaldırılanlar": the talebe the course team took out, newest first,
 * with the reason written when they went and who wrote it. A removed talebe
 * cannot apply again; the row is the record of the removal. `rows` is null when
 * the list could not be read, and the tab says so instead of showing an empty
 * record.
 */
export function RemovedTable({ rows }: { rows: RemovedRow[] | null }) {
  const t = useTranslations("nazir");

  if (rows === null) {
    return (
      <output className="mds-body-sm text-neutral-muted">
        {t("CourseStudents.removedUnavailable")}
      </output>
    );
  }

  const columns: TableColumn<RemovedRow>[] = [
    {
      key: "student",
      header: t("CourseStudents.columns.student"),
      rowHeader: true,
      width: "24%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar name={row.name} decorative />
          <span className="flex min-inline-0 flex-col">
            <bdi className="font-semibold">{row.name}</bdi>
            {row.email ? (
              <bdi dir="ltr" className="mds-caption break-all font-mono">
                {row.email}
              </bdi>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "at",
      header: t("CourseStudents.columns.removedAt"),
      width: "14%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.at.iso}>
          {row.at.label}
        </time>
      ),
    },
    {
      key: "reason",
      header: t("CourseStudents.columns.reason"),
      width: "40%",
      render: (row) => <bdi>{row.reason}</bdi>,
    },
    {
      key: "by",
      header: t("CourseStudents.columns.removedBy"),
      width: "22%",
      render: (row) => <bdi>{row.by}</bdi>,
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="roster-removed">
      <p>{t("CourseStudents.removedNote")}</p>
      <Table
        caption={t("CourseStudents.captions.removed")}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        empty={t("CourseStudents.empty.removed")}
        responsive="stack"
      />
    </div>
  );
}
