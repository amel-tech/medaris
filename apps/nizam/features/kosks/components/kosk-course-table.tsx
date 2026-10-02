"use client";

import type { KoskCourseRowResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { dateWithCase } from "../../madrasahs/present";
import { toneOfHue } from "../admin-present";
import { restoreCourse } from "../course-actions";
import {
  COURSE_STATUS_LOOK,
  COURSE_TABS,
  type CourseTab,
  countRows,
  filterCourses,
  type Messages,
  registrationChips,
  rowActions,
  studentsCell,
  tabCount,
} from "../overview-present";
import { HideCourseDialog } from "./hide-course-dialog";

interface Props {
  koskId: string;
  rows: KoskCourseRowResponse[];
  /**
   * "manage" is the Medaris yönetimi's reading (nizam 20: the course work is
   * the köşk nazımı's, so no buttons); "nazim" is the Dersler table (nizam 23)
   * with the Kayıt durumu column and the row buttons.
   */
  mode: "manage" | "nazim";
  /** a link to the course on tedris for "Dersi gör"; the button is left out without one */
  viewHref?: (courseId: string) => string | null;
  /** the table's accessible name */
  caption: string;
}

/**
 * The courses of a köşk by status (nizam 20 and 23): the tabs with their
 * numbers, one row per course. The numbers are the rows' own, so a tab always
 * equals the list it opens. "Gizle" asks first; "Geri al" is at once.
 */
export function KoskCourseTable({
  koskId,
  rows,
  mode,
  viewHref,
  caption,
}: Props) {
  const tm = useTranslations("nizam.KoskCourses");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [tab, setTab] = useState<CourseTab>("ALL");
  const [hiding, setHiding] = useState<KoskCourseRowResponse | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const counts = countRows(rows);
  const refresh = () => startTransition(() => router.refresh());

  const restore = async (row: KoskCourseRowResponse) => {
    setBusyId(row.id);
    const result = await restoreCourse(row.id);
    setBusyId(null);
    if (!result.success) {
      toast.error(t("restoreFailed"), {
        description: t("restoreFailedBody"),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("restored"), {
      description: t("restoredBody", { name: row.title }),
    });
    refresh();
  };

  const columns: TableColumn<KoskCourseRowResponse>[] = [
    {
      key: "course",
      header: t("columns.course"),
      rowHeader: true,
      width: mode === "nazim" ? "22%" : "38%",
      render: (row) => (
        <span className="flex min-w-0 items-center gap-3">
          <CoverPattern tone={toneOfHue(row.coverHue)} size="xs" />
          <span className="flex min-w-0 flex-col gap-1">
            {row.status === "HIDDEN" ? (
              <span className="font-semibold">
                <bdi>{row.title}</bdi>
              </span>
            ) : (
              <a
                className="mds-link font-semibold"
                href={`/${locale}/kosks/${koskId}/courses/${row.id}`}
              >
                <bdi>{row.title}</bdi>
              </a>
            )}
            <span className="mds-caption">
              {[
                row.madrasah?.name,
                row.weekCount === 0
                  ? null
                  : t("weeks", { count: row.weekCount }),
                row.status === "HIDDEN" && row.hiddenAt
                  ? t("hiddenOn", {
                      dateLocative: dateWithCase(
                        new Date(row.hiddenAt),
                        "locative",
                        { locale, timeZone }
                      ),
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "muderris",
      header: t("columns.muderris"),
      width: mode === "nazim" ? "15%" : "34%",
      render: (row) =>
        row.muderris.length === 0 ? (
          <span className="text-neutral-muted">{t("noMuderris")}</span>
        ) : (
          <span className="flex flex-col">
            {row.muderris.map((m) => (
              <span key={m.name}>
                <bdi>{m.name}</bdi>
                {m.isImam ? (
                  <span className="mds-caption">, {t("imam")}</span>
                ) : null}
              </span>
            ))}
          </span>
        ),
    },
    {
      key: "students",
      header: t("columns.students"),
      align: "right",
      width: mode === "nazim" ? "7%" : "8%",
      render: (row) => {
        const n = studentsCell(row);
        return n === null ? (
          <span>
            <span aria-hidden="true">—</span>
            <span className="mds-visually-hidden">{t("noStudents")}</span>
          </span>
        ) : (
          <span className="tabular-nums">{n}</span>
        );
      },
    },
    ...(mode === "nazim"
      ? [
          {
            key: "registration",
            header: t("columns.registration"),
            width: "16%",
            render: (row: KoskCourseRowResponse) => {
              const chips = registrationChips(row);
              if (chips.length === 0) return <span aria-hidden="true">—</span>;
              return (
                <span className="flex flex-col items-start gap-1">
                  {chips.map((chip) => (
                    <Badge
                      key={chip.kind}
                      variant={chip.kind === "pending" ? "warning" : "error"}
                      icon={
                        <Icon
                          name={chip.kind === "pending" ? "clock" : "ban"}
                          size="sm"
                        />
                      }
                    >
                      {t(`chip.${chip.kind}`, { count: chip.count })}
                    </Badge>
                  ))}
                </span>
              );
            },
          } satisfies TableColumn<KoskCourseRowResponse>,
        ]
      : []),
    {
      key: "status",
      header: t("columns.status"),
      width: mode === "nazim" ? "11%" : "12%",
      render: (row) => {
        const look = COURSE_STATUS_LOOK[row.status];
        return look.badge ? (
          <Badge variant={look.badge}>{t(`status.${row.status}`)}</Badge>
        ) : (
          <span className="inline-flex items-center gap-2">
            {look.icon ? <Icon name={look.icon} size="sm" /> : null}
            {t(`status.${row.status}`)}
          </span>
        );
      },
    },
    ...(mode === "nazim"
      ? [
          {
            key: "actions",
            header: (
              <span className="mds-visually-hidden">
                {t("columns.actions")}
              </span>
            ),
            align: "right",
            width: "28%",
            render: (row: KoskCourseRowResponse) => {
              const href = viewHref?.(row.id) ?? null;
              return (
                <span className="flex flex-nowrap items-center justify-end gap-1 whitespace-nowrap">
                  {rowActions(row).map((action) => {
                    switch (action) {
                      case "edit":
                        return (
                          <Button
                            key={action}
                            variant="ghost"
                            size="small"
                            href={`/${locale}/kosks/${koskId}/courses/${row.id}/edit`}
                            aria-label={t("editLabel", { name: row.title })}
                          >
                            {t("edit")}
                          </Button>
                        );
                      case "editMuderris":
                        return (
                          <Button
                            key={action}
                            variant="ghost"
                            size="small"
                            href={`/${locale}/kosks/${koskId}/courses/${row.id}/edit`}
                            aria-label={t("editMuderrisLabel", {
                              name: row.title,
                            })}
                          >
                            {t("editMuderris")}
                          </Button>
                        );
                      case "view":
                        return href ? (
                          <Button
                            key={action}
                            variant="outline"
                            size="small"
                            href={href}
                            aria-label={t("viewLabel", { name: row.title })}
                          >
                            {t("view")}
                          </Button>
                        ) : null;
                      case "hide":
                        return (
                          <Button
                            key={action}
                            variant="ghost"
                            size="small"
                            aria-label={t("hideLabel", { name: row.title })}
                            onClick={() => setHiding(row)}
                          >
                            {t("hide")}
                          </Button>
                        );
                      case "restore":
                        return (
                          <Button
                            key={action}
                            variant="outline"
                            size="small"
                            iconLeft={<Icon name="undo" size="sm" />}
                            loading={busyId === row.id}
                            aria-label={t("restoreLabel", { name: row.title })}
                            onClick={() => void restore(row)}
                          >
                            {t("restore")}
                          </Button>
                        );
                      default:
                        return null;
                    }
                  })}
                </span>
              );
            },
          } satisfies TableColumn<KoskCourseRowResponse>,
        ]
      : []),
  ];

  return (
    <>
      <Tabs
        label={t("tabsLabel")}
        locale={locale}
        value={tab}
        onChange={(next) => setTab(next as CourseTab)}
        tabs={COURSE_TABS.map((value) => ({
          value,
          label: t(`tabs.${value}`),
          count: tabCount(counts, value),
        }))}
      >
        {COURSE_TABS.map((value) => (
          <TabsPanel key={value} value={value} className="pbs-4">
            {value !== tab ? null : (
              <Table
                caption={caption}
                responsive="stack"
                columns={columns}
                rows={filterCourses(rows, value)}
                rowKey={(row) => row.id}
                empty={t(rows.length === 0 ? "emptyAll" : "emptyTab")}
              />
            )}
          </TabsPanel>
        ))}
      </Tabs>
      <HideCourseDialog
        open={hiding !== null}
        onOpenChange={(open) => {
          if (!open) setHiding(null);
        }}
        courseId={hiding?.id ?? ""}
        courseTitle={hiding?.title ?? ""}
        onHidden={refresh}
      />
    </>
  );
}
