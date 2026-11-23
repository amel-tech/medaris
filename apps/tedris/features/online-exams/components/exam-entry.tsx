import type { ExamBriefingResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";

/**
 * "Sınava gir" on an online exam's celse page (MDRS-299): when it can be
 * started, and the way to the exam's own page. The words are the page's, so
 * this stays a plain server component.
 */
export const ExamEntry = ({
  briefing,
  href,
  labels,
}: {
  briefing: ExamBriefingResponse;
  href: string;
  labels: { title: string; when: string; action: string; taken: string };
}) => (
  <section
    className="mds-card flex flex-col gap-2"
    aria-labelledby="online-exam-entry"
    data-testid="online-exam-entry"
  >
    <h2 className="mds-card__title" id="online-exam-entry">
      {labels.title}
    </h2>
    <p className="mds-body-sm text-neutral-muted">
      {briefing.attempt?.status === "FINISHED" ? labels.taken : labels.when}
    </p>
    <div>
      <Button href={href}>{labels.action}</Button>
    </div>
  </section>
);
