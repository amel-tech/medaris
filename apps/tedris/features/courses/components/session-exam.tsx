import type { LessonExamResponse } from "@medaris/services/tedrisat";

/**
 * What a talebe needs to know about an exam celse (MDRS-248), on its page
 * under the main card: written or oral and out of how much, where it is held
 * when in person, and the topics it covers. The texts are shown as typed,
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
    place: string;
    topics: string;
  };
}) => (
  <section
    className="mds-card flex flex-col gap-3"
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
    </p>
    {exam.location ? (
      <p className="mds-body" data-testid="session-exam-place">
        <span className="mds-label">{labels.place}: </span>
        <bdi>{exam.location}</bdi>
      </p>
    ) : null}
    {exam.topics ? (
      <div className="flex flex-col gap-1">
        <span className="mds-label">{labels.topics}</span>
        <p
          className="mds-body whitespace-pre-line"
          dir="auto"
          data-testid="session-exam-topics"
        >
          {exam.topics}
        </p>
      </div>
    ) : null}
  </section>
);
