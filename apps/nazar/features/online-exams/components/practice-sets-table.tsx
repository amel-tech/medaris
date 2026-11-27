"use client";

import { Badge } from "@medaris/ui/mds/badge";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Table } from "@medaris/ui/mds/table";
import { useFormatter, useTranslations } from "next-intl";

/** One çalışma seti as the list shows it; the figures are null where there are none. */
export interface PracticeSetRow {
  id: string;
  title: string;
  draft: boolean;
  questionCount: number;
  talebeCount: number | null;
  attemptCount: number | null;
  /** The API's percentage with two decimals, e.g. "76.15". */
  averagePercent: string | null;
}

/**
 * "76.15" as "%76": a whole percentage, rounded half up on the decimal text
 * (not on 0.725 as a float, which would round "72.50" down).
 */
export const wholePercent = (
  format: ReturnType<typeof useFormatter>,
  percent: string
) =>
  format.number(Math.round(Number(percent)) / 100, {
    style: "percent",
    maximumFractionDigits: 0,
  });

const COMPACT_STACK = [
  "max-md:[&_td[data-label]]:inline-flex!",
  "max-md:[&_td[data-label]]:items-baseline",
  "max-md:[&_td[data-label]]:gap-1",
  "max-md:[&_td[data-label]]:me-4",
  "max-md:[&_td[data-label]]:before:inline!",
  // Tailwind's `before:` writes its own `content`; the label is put back.
  "max-md:[&_td[data-label]]:before:content-[attr(data-label)]",
].join(" ");

/**
 * "Çalışma Soruları" as a table (MDRS-248): one row per set, its name the
 * row's link, the figures right-aligned and "—" where there are none (a
 * draft, a set nobody finished). Drafts come first: they are the hoca's
 * work in progress. Below 768 px each row is a card (`responsive="stack"`),
 * so the page never scrolls sideways; its figures run on one or two lines,
 * each after its column's name, instead of one line apiece.
 */
export function PracticeSetsTable({
  courseId,
  rows,
}: {
  courseId: string;
  rows: PracticeSetRow[];
}) {
  const t = useTranslations("nazar.Practice");
  const format = useFormatter();
  const none = (
    <>
      <span aria-hidden="true">—</span>
      <span className="mds-visually-hidden">{t("noValue")}</span>
    </>
  );
  const count = (value: number | null) =>
    value === null ? none : format.number(value);
  const ordered = [
    ...rows.filter((r) => r.draft),
    ...rows.filter((r) => !r.draft),
  ];
  if (ordered.length === 0) {
    return <EmptyState>{t("none")}</EmptyState>;
  }
  return (
    <Table<PracticeSetRow>
      caption={t("tableCaption")}
      rows={ordered}
      rowKey={(r) => r.id}
      responsive="stack"
      className={COMPACT_STACK}
      columns={[
        {
          key: "title",
          header: t("colSet"),
          rowHeader: true,
          primaryAction: true,
          render: (r) => (
            <a
              className="mds-link"
              href={`/ders/${courseId}/calisma-sorulari/${r.id}`}
              dir="auto"
            >
              {r.title}
            </a>
          ),
        },
        {
          key: "status",
          header: t("colStatus"),
          render: (r) =>
            r.draft ? (
              <Badge variant="secondary">{t("statusDraft")}</Badge>
            ) : (
              <Badge variant="success">{t("statusOpen")}</Badge>
            ),
        },
        {
          key: "questions",
          header: t("colQuestions"),
          align: "right",
          render: (r) => format.number(r.questionCount),
        },
        {
          key: "talebe",
          header: t("colTalebe"),
          align: "right",
          render: (r) => count(r.talebeCount),
        },
        {
          key: "attempts",
          header: t("colAttempts"),
          align: "right",
          render: (r) => count(r.attemptCount),
        },
        {
          key: "average",
          header: t("colAverage"),
          align: "right",
          render: (r) =>
            r.averagePercent === null
              ? none
              : wholePercent(format, r.averagePercent),
        },
      ]}
    />
  );
}
