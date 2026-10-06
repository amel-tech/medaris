"use client";

import type { RecordingResponse } from "@medaris/services/tedrisat";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { useLocale, useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import {
  embedUrlOf,
  firstPlayable,
  groupByWeek,
  isPlainWeekTitle,
  listsRecordings,
  playerApiUrlOf,
  recordingAction,
} from "../recordings-model";
import { MediaPlayer } from "./media-player";
import { PlayerWithNotes } from "./player-with-notes";
import { RecordingsFailed } from "./recordings-failed";

// Loaded when a talebe's player first shows: the panel brings the notes actions
// and YouTube's player script with it, which no other viewer of the tab needs.
const LessonNotes = lazy(() =>
  import("./lesson-notes").then((m) => ({ default: m.LessonNotes }))
);

const PROVIDER_NAMES: Record<string, string | undefined> = {
  YOUTUBE: "YouTube",
  DRIVE: "Google Drive",
  BUNNY: "Bunny Stream",
};

/**
 * One playlist row: the whole row is the button or the link (MDRS-280). In a
 * narrow list its chips go under the title instead of squeezing it.
 */
const ROW =
  "grid inline-full grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 rounded-control px-3 py-2 text-start text-neutral-default no-underline @min-[30rem]:grid-cols-[auto_minmax(0,1fr)_auto]";

/**
 * The "Ders kayıtları" tab of the course page (design tedris/24, MDRS-162):
 * a player over the course's recordings grouped by week, newest first. The
 * list is the API's — it already leaves out what this caller may not see — so
 * the tab only chooses what each row offers: a YouTube or Bunny recording
 * (MDRS-114) plays in the frame above, anything else opens at its host, one
 * still being prepared offers nothing. A Bunny recording's address is the
 * player link the API signed for this viewer in this response. For an
 * enrolled talebe (`notes`) the player has their private notes panel under it
 * (MDRS-150, MDRS-280).
 */
export const RecordingsTab = ({
  recordings,
  timeZone,
  notes = false,
}: {
  /** Null when the read failed: the tab says so and offers a retry. */
  recordings: RecordingResponse[] | null;
  timeZone: string;
  /** Whether the viewer may take notes: an enrolled talebe (MDRS-150). */
  notes?: boolean;
}) => {
  if (recordings === null) return <RecordingsFailed />;
  return (
    <RecordingsList recordings={recordings} timeZone={timeZone} notes={notes} />
  );
};

const RecordingsList = ({
  recordings,
  timeZone,
  notes,
}: {
  recordings: RecordingResponse[];
  timeZone: string;
  notes: boolean;
}) => {
  const t = useTranslations("tedrisLearn.RecordingsTab");
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(
    () => firstPlayable(recordings)?.id ?? null
  );
  const selected = recordings.find((r) => r.id === selectedId) ?? null;
  const frameId = selected ? `recording-frame-${selected.id}` : undefined;

  if (recordings.length === 0) return <EmptyState>{t("empty")}</EmptyState>;

  const date = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone,
    }).format(at);
  const longDate = (at: Date) =>
    new Intl.DateTimeFormat(locale, {
      day: "numeric",
      month: "long",
      year: "numeric",
      weekday: "long",
      timeZone,
    }).format(at);
  const minutes = (n: number) => t("minutes", { count: n });

  const facts = (rec: RecordingResponse, long: boolean) => {
    const at = rec.recordedAt ? new Date(rec.recordedAt) : null;
    const parts = [
      ...(long ? [t("weekLabel", { number: rec.weekNumber })] : []),
      ...(at ? [long ? longDate(at) : date(at)] : []),
      ...(rec.durationMinutes != null ? [minutes(rec.durationMinutes)] : []),
    ];
    return parts.join(" · ");
  };

  return (
    <div className="flex flex-col gap-section">
      {selected ? (
        <PlayerWithNotes
          player={
            <MediaPlayer
              // A new recording is a new frame: the player API is attached to one.
              key={selected.id}
              id="recording-player"
              title={selected.title}
              embedUrl={
                notes
                  ? playerApiUrlOf(embedUrlOf(selected.provider, selected.url))
                  : embedUrlOf(selected.provider, selected.url)
              }
              placeholder={t("playerPlaceholder")}
              frameId={notes ? frameId : undefined}
              frameTitle={
                selected.provider === "BUNNY"
                  ? t("bunnyFrameTitle", { title: selected.title })
                  : undefined
              }
            >
              {facts(selected, true)}
            </MediaPlayer>
          }
          notes={
            notes ? (
              <Suspense fallback={null}>
                <LessonNotes
                  key={selected.lessonId}
                  lessonId={selected.lessonId}
                  frameId={
                    selected.provider === "YOUTUBE" &&
                    embedUrlOf(selected.provider, selected.url)
                      ? frameId
                      : null
                  }
                />
              </Suspense>
            ) : null
          }
        />
      ) : null}

      {listsRecordings(recordings) ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="all-recordings"
        >
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
                    {isPlainWeekTitle(
                      group.weekTitle,
                      group.weekNumber
                    ) ? null : (
                      <span className="mds-label" dir="auto">
                        {group.weekTitle}
                      </span>
                    )}
                  </h3>
                  <ul className="m-0 flex list-none flex-col p-0">
                    {group.items.map((rec) => (
                      <li key={rec.id}>
                        <PlaylistRow
                          recording={rec}
                          current={
                            rec.id === selectedId &&
                            recordingAction(rec) === "play"
                          }
                          facts={
                            rec.status !== "READY"
                              ? `${rec.recordedAt ? `${date(new Date(rec.recordedAt))} · ` : ""}${t("preparingHint")}`
                              : facts(rec, false)
                          }
                          onPlay={() => setSelectedId(rec.id)}
                        />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </section>
      ) : null}
    </div>
  );
};

/**
 * A recording in the playlist. A row that plays is one button that loads it
 * into the player, and the one playing is marked (`aria-current`); a row that
 * opens at its host is one link to it, in a new tab; a row still being
 * prepared is plain text.
 */
const PlaylistRow = ({
  recording: rec,
  current,
  facts,
  onPlay,
}: {
  recording: RecordingResponse;
  current: boolean;
  facts: string;
  onPlay: () => void;
}) => {
  const t = useTranslations("tedrisLearn.RecordingsTab");
  const action = recordingAction(rec);
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
        {current ? (
          <span className="mds-caption font-semibold text-brand-default">
            {t("inPlayer")}
          </span>
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

  if (action === "play") {
    return (
      <button
        type="button"
        className={`${ROW} cursor-pointer transition-colors ${current ? "bg-brand-subtle" : "hover:bg-neutral-hover"}`}
        aria-current={current ? "true" : undefined}
        aria-label={t(current ? "playingLabel" : "playLabel", {
          title: rec.title,
        })}
        aria-describedby={factsId}
        onClick={onPlay}
      >
        <Icon name="play" size="sm" filled={current} />
        {body}
      </button>
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
