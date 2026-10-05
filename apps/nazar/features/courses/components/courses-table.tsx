"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Icon } from "@medaris/ui/mds/icon";
import { Menu } from "@medaris/ui/mds/menu";
import { Select } from "@medaris/ui/mds/select";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import {
  ALL,
  type CourseRow,
  coursesHref,
  type FilterOption,
  type Filters,
} from "../courses";
import { ChangeMuderris } from "./change-muderris";
import { HideCourse } from "./hide-course";

/**
 * The filters, the counter and the table of "Dersler" (nazir 07). The rows
 * arrive worded and dated, so the table has nothing to translate. The filters
 * live in the address (`?kosk=`, `?durum=`): choosing one asks the server for
 * the narrowed list, and the counter above the table counts what came back.
 * "Müderrisleri değiştir" and "Dersi gizle" in a row's menu open their dialogs
 * from here, which is why this is a client component; both read the list again
 * once they are done.
 */
export function CoursesTable({
  madrasahId,
  madrasahName,
  rows,
  counter,
  filters,
  koskOptions,
  statusOptions,
}: {
  madrasahId: string;
  madrasahName: string;
  rows: CourseRow[];
  /** "3 ders · 2 köşkte" */
  counter: string;
  filters: Filters;
  koskOptions: FilterOption[];
  statusOptions: FilterOption[];
}) {
  const t = useTranslations("nazir");
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const [changing, setChanging] = useState<CourseRow | null>(null);
  const [hiding, setHiding] = useState<CourseRow | null>(null);

  const refresh = () => startTransition(() => router.refresh());
  const filter = (next: Filters) =>
    startTransition(() => router.replace(coursesHref(madrasahId, next)));
  const filtered = filters.kosk !== null || filters.status !== null;
  const koskValue = koskOptions.some((option) => option.value === filters.kosk)
    ? (filters.kosk ?? ALL)
    : ALL;

  const columns: TableColumn<CourseRow>[] = [
    {
      key: "course",
      header: t("Courses.columns.course"),
      rowHeader: true,
      width: "32%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <CoverPattern seed={row.id} size="xs" label="" />
          <span className="flex min-inline-0 flex-col">
            {row.href ? (
              <Link
                href={row.href}
                className="font-reading font-semibold text-neutral-default underline underline-offset-4"
              >
                <bdi>{row.title}</bdi>
              </Link>
            ) : (
              <bdi className="font-reading font-semibold">{row.title}</bdi>
            )}
            <span className="mds-caption">
              <bdi>{row.meta}</bdi>
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "muderris",
      header: t("Courses.columns.muderris"),
      width: "28%",
      render: (row) => (
        <span className="flex flex-col items-start gap-1">
          {row.muderris.map((muderris, index) => (
            <span
              // a list of names that may repeat is never reordered in place
              key={`${muderris.name}:${index}`}
              className="flex flex-col items-start gap-1"
            >
              <bdi>{muderris.name}</bdi>
              {muderris.imam ? (
                <Badge variant="secondary">{t("Courses.imam")}</Badge>
              ) : null}
            </span>
          ))}
        </span>
      ),
    },
    {
      key: "students",
      header: t("Courses.columns.students"),
      align: "right",
      width: "16%",
      render: (row) =>
        row.students.none === "published" ? (
          t("Courses.noStudents")
        ) : row.students.none === "draft" ? (
          <>
            <span aria-hidden="true">{t("Nazirs.noValue")}</span>
            <span className="mds-visually-hidden">
              {t("Courses.noStudents")}
            </span>
          </>
        ) : (
          <span className="flex flex-col items-end gap-1">
            <span>{row.students.count}</span>
            {row.students.pending ? (
              <Badge variant="warning" icon={<Icon name="clock" size="sm" />}>
                {row.students.pending}
              </Badge>
            ) : null}
          </span>
        ),
    },
    {
      key: "status",
      header: t("Courses.columns.status"),
      width: "12%",
      render: (row) => (
        <Badge variant={row.status === "PUBLISHED" ? "primary" : "outline"}>
          {row.statusLabel}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Courses.columns.actions")}
        </span>
      ),
      align: "right",
      width: "12%",
      render: (row) => (
        <Menu
          label={t("Courses.actions.label", { title: row.title })}
          icon={<Icon name="more" size="sm" />}
          items={[
            {
              value: "muderris",
              label: t("Courses.actions.muderris"),
              onSelect: () => setChanging(row),
            },
            {
              value: "hide",
              label: t("Courses.actions.hide"),
              onSelect: () => setHiding(row),
            },
          ]}
        />
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="courses"
      aria-busy={loading || undefined}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mds-caption" data-testid="counter">
          {counter}
        </p>
        <fieldset className="flex min-inline-0 flex-wrap items-center gap-2 border-0 p-0">
          <legend className="mds-visually-hidden">
            {t("Courses.filters.label")}
          </legend>
          <Select
            aria-label={t("Courses.filters.kosk.label")}
            options={koskOptions}
            value={koskValue}
            onChange={(value) =>
              filter({
                ...filters,
                kosk: value && value !== ALL ? value : null,
              })
            }
          />
          <Select
            aria-label={t("Courses.filters.status.label")}
            options={statusOptions}
            value={filters.status ?? ALL}
            onChange={(value) =>
              filter({
                ...filters,
                status:
                  value === "PUBLISHED" || value === "DRAFT" ? value : null,
              })
            }
          />
        </fieldset>
      </div>
      <Table
        caption={t("Courses.caption")}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        empty={
          filtered ? (
            <span className="flex flex-col items-center gap-2">
              {t("Courses.emptyFiltered")}
              <Button
                href={coursesHref(madrasahId, { kosk: null, status: null })}
                variant="link"
                size="small"
              >
                {t("Courses.clearFilters")}
              </Button>
            </span>
          ) : (
            t("Courses.empty")
          )
        }
        responsive="stack"
      />
      {changing ? (
        <ChangeMuderris
          key={changing.id}
          madrasahId={madrasahId}
          course={changing}
          onClose={() => setChanging(null)}
          onDone={refresh}
        />
      ) : null}
      {hiding ? (
        <HideCourse
          key={hiding.id}
          madrasahId={madrasahId}
          madrasahName={madrasahName}
          course={hiding}
          onClose={() => setHiding(null)}
          onDone={refresh}
        />
      ) : null}
    </div>
  );
}
