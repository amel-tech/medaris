"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { CourseNazirRow, CourseNazirsContext } from "../course-nazirs";
import { CourseNazirDialog } from "./course-nazir-dialog";
import { EndCourseNazir } from "./end-course-nazir";

/**
 * The table of "Ders nazırları" (MDRS-270). The rows arrive worded and dated,
 * so the table has nothing to translate; the kit's `Table` keeps state of its
 * own and the dialogs are opened from here, which is why this is a client
 * component. Each row draws only what the API says the viewer may do on it:
 * no "İzinleri düzenle" on their own post or for one who appoints only, and
 * "Görevden al" for one who appoints only on their own appointees. A ders
 * nazırı whose appointees still hold their posts is dismissed after them, so
 * the button waits and says why.
 */
export function CourseNazirsTable({
  rows,
  context,
}: {
  rows: CourseNazirRow[];
  context: CourseNazirsContext;
}) {
  const t = useTranslations("nazar");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<CourseNazirRow | null>(null);
  const [ending, setEnding] = useState<CourseNazirRow | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  const columns: TableColumn<CourseNazirRow>[] = [
    {
      key: "nazir",
      header: t("CourseNazirs.columns.nazir"),
      rowHeader: true,
      width: "26%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar name={row.name} decorative />
          <span className="flex min-inline-0 flex-col">
            <span>
              <bdi className="font-semibold">{row.name}</bdi>
              {row.isYou ? ` ${t("CourseNazirs.you")}` : null}
            </span>
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
      key: "permissions",
      header: t("CourseNazirs.columns.permissions"),
      width: "30%",
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          <span className="font-semibold">{row.count}</span>
          {row.permissionsLine ? (
            <span className="mds-caption" data-testid="permissions-line">
              {row.permissionsLine}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "end",
      header: t("CourseNazirs.columns.end"),
      width: "12%",
      render: (row) =>
        row.ends.iso ? (
          <time dateTime={row.ends.iso}>{row.ends.label}</time>
        ) : (
          row.ends.label
        ),
    },
    {
      key: "giver",
      header: t("CourseNazirs.columns.giver"),
      width: "14%",
      render: (row) => (
        <span className="flex flex-col">
          <span>
            <bdi>{row.giver.name}</bdi>
            {row.giver.isYou ? ` ${t("CourseNazirs.you")}` : null}
          </span>
          <time className="mds-caption" dateTime={row.giver.at.iso}>
            {row.giver.at.label}
          </time>
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("CourseNazirs.columns.actions")}
        </span>
      ),
      align: "right",
      width: "18%",
      render: (row) => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          {row.mayEdit ? (
            <Button
              variant="outline"
              size="small"
              aria-label={t("CourseNazirs.editLabel", { name: row.name })}
              onClick={() => setEditing(row)}
            >
              {t("CourseNazirs.edit")}
            </Button>
          ) : null}
          {row.mayEnd ? (
            <Button
              variant="ghost"
              size="small"
              aria-label={t("CourseNazirs.endLabel", { name: row.name })}
              aria-describedby={
                row.appointees > 0 ? `end-blocked-${row.id}` : undefined
              }
              disabled={row.appointees > 0}
              onClick={() => setEnding(row)}
            >
              {t("CourseNazirs.end")}
            </Button>
          ) : null}
          {row.mayEnd && row.appointees > 0 ? (
            <span id={`end-blocked-${row.id}`} className="mds-caption">
              {t("CourseNazirs.endBlocked", { count: row.appointees })}
            </span>
          ) : null}
        </span>
      ),
    },
  ];

  return (
    <div data-testid="course-nazirs">
      <Table
        caption={t("CourseNazirs.caption", { course: context.courseTitle })}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={t("CourseNazirs.empty")}
        responsive="stack"
      />
      <CourseNazirDialog
        open={editing !== null}
        row={editing}
        context={context}
        onClose={() => setEditing(null)}
        onDone={refresh}
      />
      <EndCourseNazir
        courseId={context.courseId}
        courseTitle={context.courseTitle}
        row={ending}
        onClose={() => setEnding(null)}
        onDone={refresh}
      />
    </div>
  );
}
