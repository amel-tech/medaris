"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import type { TableSort } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  type ApplicationRow,
  courseChoices,
  filterApplications,
  type Messages,
  rowKey,
  sortByDate,
} from "../present";
import { useDecisions } from "../use-decisions";
import { ApplicationsTable } from "./applications-table";

/**
 * Başvurular (nizam 31): every application waiting in the köşk's courses, with
 * a course filter, a search over name and address, and the count that follows
 * both. Deciding drops the row at once; the count is the list's own length,
 * so it can never disagree with it.
 */
export function ApplicationsView({
  koskId,
  koskName,
  initial,
}: {
  koskId: string;
  koskName: string;
  /** null when the first read failed */
  initial: ApplicationRow[] | null;
}) {
  const t = useTranslations("nizam.ApplicationsPage") as unknown as Messages;
  const router = useRouter();
  const { busy, decided, decide } = useDecisions(koskId);
  const [courseId, setCourseId] = useState("all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<TableSort>({
    key: "date",
    direction: "descending",
  });

  const rows = useMemo(
    () => (initial ?? []).filter((row) => !decided.has(rowKey(row))),
    [initial, decided]
  );
  const choices = useMemo(() => courseChoices(rows), [rows]);
  // a filter on a course whose last application was just decided falls back to all
  const active = choices.some((c) => c.id === courseId) ? courseId : "all";
  const visible = useMemo(
    () => sortByDate(filterApplications(rows, active, query), sort.direction),
    [rows, active, query, sort.direction]
  );

  return (
    <>
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro")}</p>
      </header>

      <section
        aria-labelledby="applications-heading"
        className="flex flex-col gap-4"
      >
        <h2 id="applications-heading" className="mds-visually-hidden">
          {t("heading")}
        </h2>

        {initial === null ? (
          <Alert tone="error" title={t("loadFailedTitle")}>
            <p>{t("loadFailed")}</p>
            <Button
              variant="outline"
              size="small"
              onClick={() => router.refresh()}
            >
              {t("retry")}
            </Button>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Select
                options={[
                  { value: "all", label: t("allCourses") },
                  ...choices.map((c) => ({
                    value: c.id,
                    label: t("courseOption", { course: c.title }),
                  })),
                ]}
                value={active}
                onChange={(v) => setCourseId(v ?? "all")}
                aria-label={t("courseFilterLabel")}
              />
              <div className="min-w-[16rem] grow md:max-w-[26rem]">
                <Field>
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t("searchPlaceholder")}
                    aria-label={t("searchLabel")}
                    leading={<Icon name="search" size="sm" />}
                  />
                </Field>
              </div>
              <p
                className="ms-auto mds-caption"
                aria-live="polite"
                data-testid="applications-count"
              >
                {t("count", { count: visible.length })}
              </p>
            </div>

            <ApplicationsTable
              variant="kosk"
              rows={visible}
              caption={t("caption", { kosk: koskName })}
              empty={rows.length === 0 ? t("empty") : t("emptyFiltered")}
              busyKey={busy}
              sort={sort}
              onSortChange={setSort}
              onDecide={decide}
            />
          </>
        )}
      </section>
    </>
  );
}
