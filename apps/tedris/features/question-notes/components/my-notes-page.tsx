import type { MyQuestionNoteListItemResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import Link from "next/link";
import { getLocale, getTimeZone, getTranslations } from "next-intl/server";
import { ArabicText } from "~/features/online-exams/components/arabic-text";
import { resultHref as examResultHref } from "~/features/online-exams/my-exams-model";
import { PRACTICE_HREF, solveHref } from "~/features/practice/practice-model";
import type { LooseTranslator } from "~/lib/i18n/loose";
import { sortNotes } from "../note-model";
import type { MyQuestionNotesRead } from "../reads";
import { QuestionNoteSummary } from "./question-note";

// Narrow on purpose: the full translator type hits TS2589 (MDRS-176).
type Translate = LooseTranslator;

/**
 * "Notlarım" of a course (MDRS-248, soru notları): every note the talebe
 * wrote on a question of the course, a çalışma seti's or an exam's, with the
 * question, its set, whether it was sent to the hoca and the hoca's answer.
 * An answer not read before this page opened leads the list and is marked
 * "Yeni cevap"; opening the page is what marks them read (the API does).
 */
export async function MyNotesPage({
  read,
  courseTitle,
}: {
  read: MyQuestionNotesRead | null;
  courseTitle: string | null;
}) {
  const t: Translate = (await getTranslations("tedris.QuestionNotes")) as never;
  const tp: Translate = (await getTranslations("tedris.Practice")) as never;
  const locale = await getLocale();
  const timeZone = await getTimeZone();
  const when = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone,
  });

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <nav aria-label={tp("breadcrumbLabel")} className="mds-caption">
        <Link className="mds-btn mds-btn--link" href={PRACTICE_HREF}>
          {tp("pageTitle")}
        </Link>
      </nav>
      <div className="flex flex-col gap-2">
        <h1 className="mds-h1">{t("notesTitle")}</h1>
        {courseTitle ? (
          <p className="mds-h3" dir="auto" data-testid="notes-course">
            {courseTitle}
          </p>
        ) : null}
        <p className="mds-body">{t("notesIntro")}</p>
      </div>

      {read === null || read.status === "absent" ? (
        <Alert tone="neutral" title={t("notesNotFoundTitle")}>
          <p>{t("notesNotFound")}</p>
          <p className="mbs-3">
            <Button variant="secondary" size="small" href={PRACTICE_HREF}>
              {tp("backToList")}
            </Button>
          </p>
        </Alert>
      ) : read.status === "failed" ? (
        <Alert tone="error" title={t("notesLoadFailedTitle")}>
          <p>{t("notesLoadFailed")}</p>
          <p className="mbs-3">
            <Button variant="outline" size="small" href="">
              {tp("retry")}
            </Button>
          </p>
        </Alert>
      ) : read.notes.length === 0 ? (
        <EmptyState>
          <p>{t("notesEmpty")}</p>
        </EmptyState>
      ) : (
        <section className="flex flex-col gap-3" aria-labelledby="notes-list">
          <h2 id="notes-list" className="mds-h2">
            {t("notesCount", { count: read.notes.length })}
          </h2>
          <ol className="flex flex-col gap-3" data-testid="notes-list">
            {sortNotes(read.notes).map((note) => (
              <li key={note.id}>
                <NoteCard
                  note={note}
                  t={t}
                  at={(value) => when.format(new Date(value))}
                />
              </li>
            ))}
          </ol>
        </section>
      )}
    </main>
  );
}

function NoteCard({
  note,
  t,
  at,
}: {
  note: MyQuestionNoteListItemResponse;
  t: Translate;
  at: (value: Date | string) => string;
}) {
  const exam = note.examKind === "EXAM";
  const href = exam
    ? note.lessonId
      ? examResultHref(note.lessonId)
      : null
    : solveHref(note.examId);
  return (
    <article
      className="mds-card flex flex-col gap-2 break-words"
      data-testid="notes-item"
      data-new-reply={note.newReply ? "true" : undefined}
      style={{
        padding: "var(--space-4)",
        overflowWrap: "anywhere",
        ...(note.newReply
          ? {
              borderInlineStartWidth: "4px",
              borderInlineStartColor: "var(--border-brand-default)",
            }
          : null),
      }}
    >
      <p className="mds-caption text-neutral-muted">
        {t(exam ? "notesExam" : "notesSet")} <ArabicText text={note.setTitle} />
      </p>
      <ArabicText
        as="h3"
        className="mds-body-sm font-semibold"
        size="var(--fs-body-sm)"
        weight="var(--weight-semibold)"
        text={note.questionText}
      />
      <QuestionNoteSummary note={note} />
      {note.sharedWithTeacher && !note.teacherReply ? (
        <p className="mds-caption text-neutral-muted">{t("noReplyYet")}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="mds-caption text-neutral-muted">
          {t("updatedAt", { at: at(note.updatedAt) })}
        </p>
        {href ? (
          <Button size="small" variant="link" href={href}>
            {t(exam ? "openResult" : "openSet")}
          </Button>
        ) : null}
      </div>
    </article>
  );
}
