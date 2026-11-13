import type { LessonExamResponse } from "@medaris/services/tedrisat";

/**
 * What a talebe needs to know about an exam celse (MDRS-248), on its page
 * under the main card: one line with written or oral, out of how much and,
 * when in person, where it is held; then the topics it covers. The texts are shown as typed,
 * never as HTML. The API sends `exam` only to who may read the course.
 */
export const SessionExam = ({
  exam,
  labels,
}: {
  exam: LessonExamResponse;
  labels: {
    title: string;
    format: string;
    maxScore: string;
  };
}) => (
  <section
    className="mds-card flex flex-col gap-2"
    aria-labelledby="exam-title"
    data-testid="session-exam"
  >
    <h2 className="mds-card__title" id="exam-title">
      {labels.title}
    </h2>
    <p className="mds-body-sm text-neutral-muted">
      {labels.format}
      <span className="mds-sep" aria-hidden="true">
        ·
      </span>
      <span className="mds-num">{labels.maxScore}</span>
      {exam.location ? (
        <>
          <span className="mds-sep" aria-hidden="true">
            ·
          </span>
          <bdi data-testid="session-exam-place">{exam.location}</bdi>
        </>
      ) : null}
    </p>
    {exam.topics ? (
      <p
        className="mds-body whitespace-pre-line"
        dir="auto"
        data-testid="session-exam-topics"
      >
        {exam.topics}
      </p>
    ) : null}
  </section>
);
