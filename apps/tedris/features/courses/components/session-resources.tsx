import { ArabicText } from "./arabic-text";
import { ResourceList, type ResourceRow } from "./course-resources";

/** Whether "Kaynaklar" has anything to show: a kaynak, or a link of the celse's or the course's. */
export const hasSessionResources = (
  kaynak: string | null,
  own: readonly ResourceRow[] | undefined,
  course: readonly ResourceRow[] | undefined
): boolean =>
  Boolean(kaynak) || (own?.length ?? 0) > 0 || (course?.length ?? 0) > 0;

/**
 * "Kaynaklar" of the celse detail page (MDRS-289): one card for what to
 * read and open. The celse's kaynak on top as "Okunacak yer: …" (MDRS-279),
 * then the celse's own links under "Bu celse" (MDRS-286) and the course's
 * under "Ders geneli"; each group only when it has rows, and nothing at all
 * when none has. Every name goes to whoever may see the celse, each link
 * only to who may read the content, so a locked body lists the names and
 * says who opens them. The kaynak is content as well: the API sends it to
 * who may read it, and to everyone for the sample session (MDRS-161).
 */
export const SessionResources = ({
  kaynak,
  own,
  ownLocked,
  course,
  courseLocked,
  labels,
}: {
  kaynak: string | null;
  own: readonly ResourceRow[] | undefined;
  ownLocked: boolean;
  course: readonly ResourceRow[] | undefined;
  courseLocked: boolean;
  labels: {
    title: string;
    /** "Okunacak yer:" */
    reading: string;
    own: string;
    course: string;
    newTab: string;
    locked: string;
  };
}) => {
  if (!hasSessionResources(kaynak, own, course)) return null;
  const ownRows = own ?? [];
  const courseRows = course ?? [];
  const locked =
    (ownLocked && ownRows.length > 0) ||
    (courseLocked && courseRows.length > 0);
  const group = (
    title: string,
    rows: readonly ResourceRow[],
    testId: string
  ) =>
    rows.length > 0 ? (
      <div className="flex flex-col gap-1">
        <h3 className="mds-eyebrow">{title}</h3>
        <ResourceList resources={rows} newTab={labels.newTab} testId={testId} />
      </div>
    ) : null;
  return (
    <section
      className="mds-card flex flex-col gap-4"
      aria-labelledby="resources-title"
      data-testid="session-resources-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h2 className="mds-card__title" id="resources-title">
          {labels.title}
        </h2>
        {kaynak ? (
          <p
            className="mds-body-sm text-neutral-muted"
            data-testid="session-kaynak"
          >
            {labels.reading}{" "}
            <span className="text-neutral-default" dir="auto">
              <ArabicText text={kaynak} />
            </span>
          </p>
        ) : null}
      </div>
      {group(labels.own, ownRows, "session-resources")}
      {group(labels.course, courseRows, "course-resources")}
      {locked ? <p className="mds-caption">{labels.locked}</p> : null}
    </section>
  );
};
