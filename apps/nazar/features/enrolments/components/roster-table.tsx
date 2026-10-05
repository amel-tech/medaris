"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Progress } from "@medaris/ui/mds/progress";
import { Table, type TableColumn, type TableSort } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { setCompleted } from "../actions";
import {
  byName,
  enrolmentErrorKey,
  matching,
  ROSTER_PAGE,
  type RosterAction,
  type RosterPermissions,
  type RosterRow,
  rosterActions,
  seatMoved,
} from "../enrolments";
import { RemoveDialog } from "./remove-dialog";

/**
 * The Kayıtlı and Tamamlayanlar tables: search by name or e-mail, the talebe's
 * own progress, and per row "Tamamladı say" (`enrollment.complete`) and
 * "Dersten çıkar" (`enrollment.remove`), or "Yeniden aç" (`enrollment.complete`):
 * a button the caller's `can` does not allow is not drawn, and a table with none
 * has no actions column. The list is the one the page read, so the search and the paging are
 * the browser's: ten rows at a time, "Daha fazla göster" for the rest. A seat
 * that is no longer as the page showed it (somebody else moved it) is told so
 * and the list is read again.
 */
export function RosterTable({
  variant,
  courseId,
  courseName,
  can,
  rows,
}: {
  variant: "enrolled" | "completed";
  courseId: string;
  courseName: string;
  can: RosterPermissions;
  rows: RosterRow[];
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const { notify } = useToaster();
  const [, startTransition] = useTransition();

  const [search, setSearch] = useState("");
  const [visible, setVisible] = useState(ROSTER_PAGE);
  const [sort, setSort] = useState<TableSort>({
    key: "student",
    direction: "ascending",
  });
  const [busy, setBusy] = useState<string | null>(null);
  const [removing, setRemoving] = useState<RosterRow | null>(null);

  const found = byName(
    matching(rows, search),
    sort.direction === "descending" ? "descending" : "ascending"
  );
  const shown = found.slice(0, visible);

  const complete = (row: RosterRow, completed: boolean) => {
    setBusy(row.userId);
    startTransition(async () => {
      const result = await setCompleted(courseId, row.userId, completed);
      if (result.success) {
        notify({
          title: t(
            completed
              ? "CourseStudents.roster.completed"
              : "CourseStudents.roster.reopened"
          ),
          description: t(
            completed
              ? "CourseStudents.roster.completedBody"
              : "CourseStudents.roster.reopenedBody",
            { name: row.name }
          ),
        });
      } else {
        notify({
          tone: seatMoved(result.code) ? "info" : "error",
          title: t("CourseStudents.roster.failedTitle"),
          description: words(enrolmentErrorKey(result.code)),
        });
      }
      if (result.success || seatMoved(result.code)) router.refresh();
      setBusy(null);
    });
  };

  const act = (row: RosterRow, action: RosterAction) => {
    if (action === "remove") setRemoving(row);
    else complete(row, action === "complete");
  };

  const actions = rosterActions(variant, can);
  const columns: TableColumn<RosterRow>[] = [
    {
      key: "student",
      header: t("CourseStudents.columns.student"),
      rowHeader: true,
      sortable: true,
      width: "22%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar name={row.name} decorative />
          <bdi className="font-semibold">{row.name}</bdi>
        </span>
      ),
    },
    {
      key: "email",
      header: t("CourseStudents.columns.email"),
      width: "24%",
      render: (row) =>
        row.email ? (
          <bdi dir="ltr" className="break-all font-mono">
            {row.email}
          </bdi>
        ) : (
          t("Nazirs.noValue")
        ),
    },
    {
      key: "joined",
      header: t("CourseStudents.columns.joined"),
      width: "11%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.joined.iso}>
          {row.joined.label}
        </time>
      ),
    },
    {
      key: "progress",
      header: t("CourseStudents.columns.progress"),
      width: "13%",
      render: (row) => (
        <Progress
          value={row.progress}
          label={t("CourseStudents.roster.progressLabel", { name: row.name })}
          showValue
          completeLabel={t("CourseStudents.roster.progressDone")}
          locale={locale}
          labelHidden
        />
      ),
    },
  ];
  if (actions.length > 0) {
    columns.push({
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("CourseStudents.columns.actions")}
        </span>
      ),
      align: "right",
      width: "30%",
      render: (row) => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          {actions.map((action, index) => (
            <Button
              key={action}
              variant={index === 0 ? "outline" : "ghost"}
              size="small"
              loading={busy === row.userId && action !== "remove"}
              disabled={busy === row.userId}
              aria-label={t(`CourseStudents.roster.${action}Label`, {
                name: row.name,
              })}
              onClick={() => act(row, action)}
            >
              {t(`CourseStudents.roster.${action}`)}
            </Button>
          ))}
        </span>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-4" data-testid={`roster-${variant}`}>
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2">
        <div className="min-inline-[16rem] max-inline-[26rem] flex-1">
          <Field>
            <Input
              type="search"
              name="q"
              aria-label={t("CourseStudents.roster.searchLabel")}
              placeholder={t("CourseStudents.roster.searchPlaceholder")}
              leading={<Icon name="search" size="sm" />}
              value={search}
              autoComplete="off"
              onChange={(event) => {
                setSearch(event.target.value);
                setVisible(ROSTER_PAGE);
              }}
            />
          </Field>
        </div>
        {variant === "enrolled" ? (
          <p className="mds-caption max-inline-[26rem] text-end">
            {t("CourseStudents.roster.help")}
          </p>
        ) : null}
      </div>
      <Table
        caption={t(`CourseStudents.captions.${variant}`)}
        columns={columns}
        rows={shown}
        rowKey={(row) => row.userId}
        sort={sort}
        onSortChange={setSort}
        empty={
          rows.length === 0
            ? t(`CourseStudents.empty.${variant}`)
            : t("CourseStudents.roster.emptySearch")
        }
        responsive="stack"
      />
      {rows.length > 0 && found.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="mds-caption" data-testid="roster-showing">
            {t("CourseStudents.roster.showing", {
              shown: shown.length,
              total: found.length,
            })}
          </p>
          {found.length > shown.length ? (
            <Button
              variant="ghost"
              onClick={() => setVisible((count) => count + ROSTER_PAGE)}
            >
              {t("CourseStudents.roster.more")}
            </Button>
          ) : null}
        </div>
      ) : null}
      {removing ? (
        <RemoveDialog
          courseId={courseId}
          courseName={courseName}
          person={removing}
          onClose={() => setRemoving(null)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
