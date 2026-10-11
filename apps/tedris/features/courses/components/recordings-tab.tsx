"use client";

import type { RecordingResponse } from "@medaris/services/tedrisat";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { useLocale, useTranslations } from "next-intl";
import {
  groupByWeek,
  isPlainWeekTitle,
  type RecordingAction,
  recordingAction,
} from "../recordings-model";
import { watchPath } from "../watch-model";
import { RecordingsFailed } from "./recordings-failed";

const PROVIDER_NAMES: Record<string, string | undefined> = {
  YOUTUBE: "YouTube",
  DRIVE: "Google Drive",
  BUNNY: "Bunny Stream",
};

/**
 * One row: the whole row is the link (MDRS-280). In a narrow list its chips
 * go under the title instead of squeezing it.
 */
const ROW =
  "grid inline-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 text-start text-neutral-default no-underline @min-[30rem]:grid-cols-[auto_minmax(0,1fr)_auto]";

/**
 * The "Ders kayıtları" tab of the course page (design tedris/24, MDRS-162):
 * the course's recordings grouped by week, newest first, each with its date,
 * its length and where it is hosted. The list is the API's — it already
 * leaves out what this caller may not see — so the tab only chooses what each
 * row offers. Since MDRS-285 a recording plays on its celse's watch page, with
 * the talebe's notes and questions beside it, and the tab has no player of
 * its own: a ready row opens that page, or the recording at its host for a
 * viewer who may not read the content (`watch` false); one still being
 * prepared offers nothing.
 */
export const RecordingsTab = ({
  recordings,
  timeZone,
  courseId,
  watch = false,
}: {
  /** Null when the read failed: the tab says so and offers a retry. */
  recordings: RecordingResponse[] | null;
  timeZone: string;
  courseId: string;
  /** Whether the viewer may read the course's content, and so open its watch pages. */
  watch?: boolean;
}) => {
  if (recordings === null) return <RecordingsFailed />;
  return (
    <RecordingsList
      recordings={recordings}
      timeZone={timeZone}
      courseId={courseId}
      watch={watch}
    />
  );
};

const RecordingsList = ({
  recordings,
  timeZone,
  courseId,
  watch,
}: {
  recordings: RecordingResponse[];
  timeZone: string;
  courseId: string;
  watch: boolean;
}) => {
  const t = useTranslations("tedrisLearn.RecordingsTab");
  const locale = useLocale();

  if (recordings.length === 0) return <EmptyState>{t("empty")}</EmptyState>;

  const date = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(at);

  const facts = (rec: RecordingResponse) => {
    const at = rec.recordedAt ? new Date(rec.recordedAt) : null;
    if (rec.status !== "READY")
      return [...(at ? [date(at)] : []), t("preparingHint")].join(" · ");
    return [
      ...(at ? [date(at)] : []),
      ...(rec.durationMinutes != null
        ? [t("minutes", { count: rec.durationMinutes })]
        : []),
    ].join(" · ");
  };

  return (
    <section className="flex flex-col gap-3" aria-labelledby="all-recordings">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 className="mds-h3" id="all-recordings">
          {t("allTitle")}
        </h2>
        <span className="mds-caption">{t("allHint")}</span>
      </div>
      <div
        className="mds-card @container flex flex-col gap-4"
        data-density="compact"
      >
        {groupByWeek(recordings).map((group) => {
          const label = t("weekLabel", { number: group.weekNumber });
          return (
            <section
              key={group.weekId}
              className="flex flex-col gap-1"
              aria-labelledby={`week-${group.weekId}`}
            >
              <h3
                className="m-0 flex flex-wrap items-baseline gap-x-2 px-3"
                id={`week-${group.weekId}`}
              >
                <span className="mds-eyebrow">{label}</span>{" "}
                {isPlainWeekTitle(group.weekTitle, group.weekNumber) ? null : (
                  <span className="mds-label" dir="auto">
                    {group.weekTitle}
                  </span>
                )}
              </h3>
              <ul className="m-0 flex list-none flex-col p-0">
                {group.items.map((rec) => (
                  <li key={rec.id}>
                    <RecordingRow
                      recording={rec}
                      facts={facts(rec)}
                      action={recordingAction(rec, watch)}
                      watchHref={watchPath(courseId, rec.lessonId)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </section>
  );
};

/**
 * A recording in the list. A ready one is one link, to its celse's watch
 * page in this tab, or to its host in a new tab; one still being prepared is
 * plain text.
 */
const RecordingRow = ({
  recording: rec,
  facts,
  action,
  watchHref,
}: {
  recording: RecordingResponse;
  facts: string;
  action: RecordingAction;
  /** Its celse's watch page. */
  watchHref: string;
}) => {
  const t = useTranslations("tedrisLearn.RecordingsTab");
  const provider = PROVIDER_NAMES[rec.provider];
  const factsId = `recording-facts-${rec.id}`;

  const body = (
    <>
      <span className="flex min-inline-0 flex-col">
        <span className="mds-label" dir="auto">
          {rec.title}
        </span>
        <span className="mds-caption" id={factsId}>
          {facts}
        </span>
      </span>
      <span className="col-start-2 flex flex-wrap items-center gap-2 @min-[30rem]:col-start-3 @min-[30rem]:row-start-1 @min-[30rem]:justify-end">
        {rec.visibility === "PUBLIC" ? (
          <span className="mds-badge mds-badge--outline">{t("public")}</span>
        ) : null}
        {action === "none" ? (
          <span className="mds-badge mds-badge--secondary">
            <Icon name="clock" size="sm" />
            {t("preparing")}
          </span>
        ) : provider ? (
          <span className="mds-platform-chip">{provider}</span>
        ) : null}
        {action === "open" ? (
          <span className="mds-caption flex items-center gap-1 text-neutral-default">
            {t("open")}
            <Icon name="externalLink" size="sm" />
          </span>
        ) : null}
      </span>
    </>
  );

  if (action === "watch") {
    return (
      <a
        className={`${ROW} transition-colors hover:bg-neutral-hover`}
        href={watchHref}
        aria-label={t("watchLabel", { title: rec.title })}
        aria-describedby={factsId}
      >
        <Icon name="play" size="sm" />
        {body}
      </a>
    );
  }
  if (action === "open" && rec.url) {
    return (
      <a
        className={`${ROW} transition-colors hover:bg-neutral-hover`}
        href={rec.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${t("open")}${t("openLabel", { title: rec.title })}`}
        aria-describedby={factsId}
      >
        <Icon name="playCircle" size="sm" />
        {body}
      </a>
    );
  }
  return (
    <div className={ROW}>
      <Icon name="playCircle" size="sm" />
      {body}
    </div>
  );
};
