"use client";

import type { MyGradesResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { useTranslations } from "next-intl";
import { examDaysLeft } from "../exam-countdown";

export { examDaysLeft };

/**
 * "Ara sınav" on tedris (MDRS-248): the "Sınav" mark with how many days are
 * left, wherever a celse is listed, and the "Notlarım" tab of the course page.
 */

/** "Sınav · 3 gün kaldı" (or "Telafi"); the countdown only while it is ahead. */
export const ExamBadge = ({
  isRetake = false,
  startsAt,
  now,
  timeZone,
}: {
  isRetake?: boolean;
  startsAt?: string | Date | null;
  now: number;
  timeZone: string;
}) => {
  const t = useTranslations("tedris.CoursePage");
  const left = examDaysLeft(startsAt, now, timeZone);
  return (
    <Badge
      variant="warning"
      icon={<Icon name="note" size="sm" />}
      data-testid="exam-badge"
    >
      {t(isRetake ? "retakeBadge" : "examBadge")}
      {left === null ? null : ` · ${t("examCountdown", { count: left })}`}
    </Badge>
  );
};

const MARK_KEY = {
  FULL: "gradesFull",
  INCOMPLETE: "gradesIncomplete",
  ABSENT: "gradesNotRecited",
} as const;

/**
 * "Notlarım": the talebe's own exams, each with its score once the course
 * team released it ("Sonuç henüz açıklanmadı" before), and their
 * memorisation marks ("Bekliyor" while unmarked). tedrisat sends no score of
 * a closed exam, so nothing here has to hide one.
 */
export const MyGradesTab = ({ grades }: { grades: MyGradesResponse }) => {
  const t = useTranslations("tedris.CoursePage");
  if (grades.exams.length === 0 && grades.memorizations.length === 0) {
    return <EmptyState>{t("gradesEmpty")}</EmptyState>;
  }
  const row = (
    key: string,
    week: number,
    title: string,
    value: React.ReactNode,
    testId: string
  ) => (
    <li
      key={key}
      className="flex items-center justify-between gap-4 py-2 border-be border-neutral-subtle last:border-be-0"
      data-testid={testId}
    >
      <span className="flex min-inline-0 items-baseline gap-2">
        <span className="mds-caption shrink-0 text-neutral-muted">
          {t("gradesWeek", { week })}
        </span>
        <bdi className="mds-label truncate">{title}</bdi>
      </span>
      <span className="shrink-0">{value}</span>
    </li>
  );
  return (
    <div className="flex flex-col gap-section">
      {grades.exams.length > 0 ? (
        <section aria-labelledby="grades-exams" className="flex flex-col gap-2">
          <h2 id="grades-exams" className="mds-h3">
            {t("gradesExams")}
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {grades.exams.map((exam) =>
              row(
                exam.lessonId,
                exam.weekNumber,
                exam.isRetake
                  ? `${exam.title} · ${t("retakeBadge")}`
                  : exam.title,
                !exam.released ? (
                  <span className="mds-caption">{t("gradesClosed")}</span>
                ) : exam.absent ? (
                  <Badge variant="error">{t("gradesAbsent")}</Badge>
                ) : exam.score === null || exam.score === undefined ? (
                  <span className="mds-caption">{t("gradesNotEntered")}</span>
                ) : (
                  <span className="mds-h4 mds-num">
                    {t("gradesScore", {
                      score: exam.score,
                      max: exam.maxScore,
                    })}
                  </span>
                ),
                "grade-exam"
              )
            )}
          </ul>
        </section>
      ) : null}
      {grades.memorizations.length > 0 ? (
        <section
          aria-labelledby="grades-memorizations"
          className="flex flex-col gap-2"
        >
          <h2 id="grades-memorizations" className="mds-h3">
            {t("gradesMemorizations")}
          </h2>
          <ul className="m-0 flex list-none flex-col p-0">
            {grades.memorizations.map((m) =>
              row(
                m.lessonId,
                m.weekNumber,
                m.title,
                m.status ? (
                  <Badge
                    variant={
                      m.status === "FULL"
                        ? "success"
                        : m.status === "INCOMPLETE"
                          ? "warning"
                          : "error"
                    }
                  >
                    {t(MARK_KEY[m.status])}
                  </Badge>
                ) : (
                  <span className="mds-caption">{t("gradesPending")}</span>
                ),
                "grade-memorization"
              )
            )}
          </ul>
        </section>
      ) : null}
    </div>
  );
};
