import type { MyExamResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { zoneLabel } from "~/features/courses/session-model";
import type { LooseTranslator } from "~/lib/i18n/loose";
import {
  actionOf,
  groupExams,
  type MyExamGroup,
  scoreText,
} from "../my-exams-model";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

const GROUP_TITLE: Record<MyExamGroup, string> = {
  open: "groupOpen",
  coming: "groupComing",
  past: "groupPast",
};

const FORMAT: Record<MyExamResponse["format"], string> = {
  WRITTEN: "formatWritten",
  ORAL: "formatOral",
  MULTIPLE_CHOICE: "formatMultipleChoice",
};

/**
 * "Sınavlarım" (MDRS-299, `graphs/tedris/exams/mine`): every exam of the
 * talebe's courses, of every format, in three groups. An open online exam
 * leads to its page, a past one to the talebe's screen of it, a written or
 * oral one to its course's Notlarım. `exams` null is a failed read, drawn as
 * such rather than as an empty list.
 */
export async function MyExamsPage({
  exams,
}: {
  exams: MyExamResponse[] | null;
}) {
  const t: Translate = (await getTranslations("tedrisLearn.MyExams")) as never;
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });
  const at = (value: Date | string) => when.format(new Date(value));

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <div className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <p className="mds-body">{t("intro")}</p>
        <p className="mds-caption">
          {t("zone", { zone: zoneLabel(timeZone, locale) })}
        </p>
      </div>

      {exams === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <p className="mbs-3">
            <Button variant="outline" size="small" href="">
              {t("retry")}
            </Button>
          </p>
        </Alert>
      ) : exams.length === 0 ? (
        <EmptyState>
          <p>{t("empty")}</p>
          <p className="mds-body-sm text-neutral-muted">{t("emptyHint")}</p>
        </EmptyState>
      ) : (
        groupExams(exams).map(({ group, exams: listed }) => (
          <section
            key={group}
            className="flex flex-col gap-3"
            aria-labelledby={`my-exams-${group}`}
          >
            <h2 id={`my-exams-${group}`} className="mds-h2">
              {t(GROUP_TITLE[group])}
            </h2>
            <ul className="flex flex-col gap-3">
              {listed.map((exam) => (
                <li key={exam.lessonId}>
                  <ExamCard exam={exam} t={t} at={at} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </main>
  );
}

function ExamCard({
  exam,
  t,
  at,
  locale,
}: {
  exam: MyExamResponse;
  t: Translate;
  at: (value: Date | string) => string;
  locale: string;
}) {
  const online = exam.format === "MULTIPLE_CHOICE";
  const action = actionOf(exam);
  const names = { course: exam.courseTitle, title: exam.title };
  const standing =
    exam.state === "IN_PROGRESS"
      ? t("stateInProgress")
      : exam.state === "MISSED"
        ? t("stateMissed")
        : exam.state === "RELEASED"
          ? exam.score !== null
            ? t("score", {
                score: scoreText(exam.score, locale),
                max: exam.maxScore ?? 100,
              })
            : t("stateReleased")
          : exam.state === "TAKEN"
            ? t("notReleased")
            : null;
  return (
    <article
      className="mds-card flex flex-col gap-2"
      data-testid="my-exam"
      data-state={exam.state}
    >
      <p className="mds-caption" dir="auto">
        {exam.courseTitle}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="mds-h3" dir="auto">
          {exam.title}
        </h3>
        <Badge variant="outline">{t(FORMAT[exam.format])}</Badge>
      </div>
      {online && exam.durationMinutes !== null ? (
        <p className="mds-body-sm">
          {t("facts", {
            minutes: exam.durationMinutes,
            count: exam.questionCount ?? 0,
          })}
        </p>
      ) : null}
      <p className="mds-body-sm text-neutral-muted">
        {exam.state === "UPCOMING"
          ? t("opensAt", { when: at(exam.startsAt) })
          : exam.state === "OPEN" && exam.latestStartAt
            ? t("openUntil", { until: at(exam.latestStartAt) })
            : t("heldAt", { when: at(exam.startsAt) })}
      </p>
      {!online && exam.place ? (
        <p className="mds-body-sm" dir="auto">
          {t("place", { place: exam.place })}
        </p>
      ) : null}
      {standing ? <p className="mds-body">{standing}</p> : null}
      {action ? (
        <div>
          <Button
            variant={
              action.kind === "enter" || action.kind === "continue"
                ? "primary"
                : "secondary"
            }
            href={action.href}
            aria-label={t(`${action.kind}Label`, names)}
          >
            {t(action.kind)}
          </Button>
        </div>
      ) : null}
    </article>
  );
}
