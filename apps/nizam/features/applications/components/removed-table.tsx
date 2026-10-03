"use client";

import type { RemovedEnrollmentResponse } from "@medaris/services/tedrisat";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { hiddenAtLabel } from "~/features/archive/present";
import type { Messages } from "../present";

/**
 * "Erişimi kaldırılanlar" (nizam 58): the talebe the course team took out,
 * newest first, with the reason written when they went and who wrote it. A
 * talebe may have applied again since; the row is the record of the removal,
 * not of where they stand now.
 */
export function RemovedTable({
  list,
  courseTitle,
}: {
  list: RemovedEnrollmentResponse[];
  courseTitle: string;
}) {
  const t = useTranslations("nizam.StudentsRoster");
  const tb = useTranslations("nizam.BansPage") as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const now = new Date();

  const nameOf = (r: RemovedEnrollmentResponse) =>
    r.name?.trim() || r.email || t("unnamed");

  const columns: TableColumn<RemovedEnrollmentResponse>[] = [
    {
      key: "student",
      header: t("columns.student"),
      rowHeader: true,
      width: "24%",
      render: (r) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={nameOf(r)} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{nameOf(r)}</bdi>
            {r.email ? (
              <bdi
                dir="ltr"
                title={r.email}
                className="mds-caption block max-w-full truncate font-mono"
              >
                {r.email}
              </bdi>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "removedAt",
      header: t("columns.removedAt"),
      width: "14%",
      render: (r) => (
        <span className="whitespace-nowrap">
          {hiddenAtLabel(new Date(r.removedAt), now, {
            locale,
            timeZone,
            t: tb,
          })}
        </span>
      ),
    },
    {
      key: "reason",
      header: t("columns.reason"),
      width: "40%",
      render: (r) => <bdi>{r.reason}</bdi>,
    },
    {
      key: "removedBy",
      header: t("columns.removedBy"),
      width: "22%",
      render: (r) => <bdi>{r.removedBy.name ?? tb("unknownPerson")}</bdi>,
    },
  ];

  return (
    <div className="flex flex-col gap-4" data-testid="roster-removed">
      <p>{t("removedNote")}</p>
      <Table
        caption={t("captionRemoved", { course: courseTitle })}
        columns={columns}
        rows={list}
        rowKey={(r, index) => `${r.userId}:${r.removedAt}:${index}`}
        empty={t("emptyRemoved")}
        responsive="stack"
      />
    </div>
  );
}
