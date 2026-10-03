"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState, useTransition } from "react";
import { BanDialog } from "~/features/bans/components/ban-dialog";
import { ALL } from "~/features/courses/courses";
import {
  BLANK,
  type FilterOption,
  type Filters,
  type StudentRow,
  type StudentsPager,
  studentsHref,
} from "../students";

/** How long the search waits after the last key before it asks the API. */
const SEARCH_DELAY_MS = 350;

/**
 * The filters, the counter, the table and the pager of "Talebeler" (nazir 10).
 * The rows arrive worded and dated, so the table has nothing to translate. The
 * filters live in the address (`?ara=`, `?ders=`, `?durum=`, `?sayfa=`):
 * choosing one asks the server for the narrowed list, and the counter above the
 * table is the API's count over every page. The search waits for the person to
 * stop typing. "Yasakla" opens the ban dialog with this talebe's courses (and
 * the whole medrese) to choose from, which is why this is a client component.
 */
export function StudentsTable({
  madrasahId,
  madrasahName,
  rows,
  filters,
  courseOptions,
  statusOptions,
  counter,
  pager,
}: {
  madrasahId: string;
  madrasahName: string;
  rows: StudentRow[];
  filters: Filters;
  courseOptions: FilterOption[];
  statusOptions: FilterOption[];
  /** "48 talebe" */
  counter: string;
  /** null while nobody is listed */
  pager: StudentsPager | null;
}) {
  const t = useTranslations("nazir");
  const router = useRouter();
  const [loading, startTransition] = useTransition();
  const [query, setQuery] = useState(filters.q);
  const [banning, setBanning] = useState<StudentRow | null>(null);

  const navigate = useCallback(
    (next: Filters) =>
      startTransition(() => router.replace(studentsHref(madrasahId, next))),
    [router, madrasahId]
  );

  useEffect(() => {
    const wanted = query.trim();
    if (wanted === filters.q) return undefined;
    const timer = setTimeout(
      () => navigate({ ...filters, q: wanted, page: 1 }),
      SEARCH_DELAY_MS
    );
    return () => clearTimeout(timer);
  }, [query, filters, navigate]);

  // a button that is off is still a link, and keeps an address to lose
  const here = studentsHref(madrasahId, filters);
  const narrowed =
    filters.q !== "" || filters.courseId !== null || filters.status !== null;
  const courseValue = courseOptions.some(
    (option) => option.value === filters.courseId
  )
    ? (filters.courseId ?? ALL)
    : ALL;

  const columns: TableColumn<StudentRow>[] = [
    {
      key: "student",
      header: t("Students.columns.student"),
      rowHeader: true,
      width: "22%",
      render: (row) => (
        <span className="flex min-inline-0 items-center gap-3">
          <Avatar name={row.name} decorative />
          <bdi className="font-medium">{row.name}</bdi>
        </span>
      ),
    },
    {
      key: "email",
      header: t("Students.columns.email"),
      width: "22%",
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
      key: "ongoing",
      header: t("Students.columns.ongoing"),
      width: "20%",
      render: (row) =>
        row.ongoing.length > 0 ? (
          <span className="flex flex-col gap-1">
            {row.ongoing.map((title) => (
              <bdi key={title}>{title}</bdi>
            ))}
          </span>
        ) : (
          t("Nazirs.noValue")
        ),
    },
    {
      key: "completed",
      header: t("Students.columns.completed"),
      width: "18%",
      render: (row) =>
        row.completed.length > 0 ? (
          <span className="flex flex-col gap-1">
            {row.completed.map((course) => (
              <span key={course.id} className="flex flex-col">
                <bdi>{course.title}</bdi>
                {course.day ? (
                  <span className="mds-caption">{course.day}</span>
                ) : null}
              </span>
            ))}
          </span>
        ) : (
          t("Students.none")
        ),
    },
    {
      key: "first",
      header: t("Students.columns.first"),
      width: "9%",
      render: (row) => (
        <time className="whitespace-nowrap" dateTime={row.first.iso}>
          {row.first.label}
        </time>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">
          {t("Students.columns.actions")}
        </span>
      ),
      align: "right",
      width: "9%",
      render: (row) => (
        <Button
          variant="outline"
          size="small"
          aria-label={t("Students.banLabel", { name: row.name })}
          onClick={() => setBanning(row)}
        >
          {t("Students.ban")}
        </Button>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-4"
      data-testid="students"
      aria-busy={loading || undefined}
    >
      <fieldset className="flex min-inline-0 flex-wrap items-center gap-2 border-0 p-0">
        <legend className="mds-visually-hidden">
          {t("Students.filters.label")}
        </legend>
        <Field
          className="inline-full md:inline-[20rem]"
          label={
            <span className="mds-visually-hidden">
              {t("Students.filters.search")}
            </span>
          }
        >
          <Input
            type="search"
            name="q"
            autoComplete="off"
            placeholder={t("Students.filters.search")}
            leading={<Icon name="search" size="sm" />}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </Field>
        <Select
          aria-label={t("Students.filters.course.label")}
          options={courseOptions}
          value={courseValue}
          onChange={(value) =>
            navigate({
              ...filters,
              courseId: value && value !== ALL ? value : null,
              page: 1,
            })
          }
        />
        <Select
          aria-label={t("Students.filters.status.label")}
          options={statusOptions}
          value={filters.status ?? ALL}
          onChange={(value) =>
            navigate({
              ...filters,
              status:
                value === "ENROLLED" || value === "COMPLETED" ? value : null,
              page: 1,
            })
          }
        />
        <p className="mds-caption ms-auto" data-testid="counter">
          {counter}
        </p>
      </fieldset>
      <Table
        caption={t("Students.caption")}
        columns={columns}
        rows={rows}
        rowKey={(row) => row.userId}
        empty={
          narrowed ? (
            <span className="flex flex-col items-center gap-2">
              {t("Students.emptyFiltered")}
              <Button
                variant="link"
                size="small"
                onClick={() => {
                  setQuery("");
                  navigate(BLANK);
                }}
              >
                {t("Students.clearFilters")}
              </Button>
            </span>
          ) : (
            t("Students.empty")
          )
        }
        sort={{ key: "first", direction: "descending" }}
        responsive="stack"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mds-caption">{t("Students.note")}</p>
        {pager ? (
          <nav
            aria-label={t("Students.pager.label")}
            className="flex flex-wrap items-center gap-3"
          >
            <Button
              href={pager.previousHref ?? here}
              variant="ghost"
              size="small"
              disabled={pager.previousHref === null}
              iconLeft={<Icon name="chevronLeft" size="sm" />}
            >
              {t("Students.pager.previous")}
            </Button>
            <span className="mds-caption" data-testid="pager-range">
              {pager.range}
            </span>
            <Button
              href={pager.nextHref ?? here}
              variant="ghost"
              size="small"
              disabled={pager.nextHref === null}
              iconRight={<Icon name="chevronRight" size="sm" />}
            >
              {t("Students.pager.next")}
            </Button>
          </nav>
        ) : null}
      </div>
      {banning ? (
        <BanDialog
          key={banning.userId}
          madrasahId={madrasahId}
          madrasahName={madrasahName}
          person={{
            id: banning.userId,
            name: banning.name,
            email: banning.email,
          }}
          courses={banning.courses}
          onClose={() => setBanning(null)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
