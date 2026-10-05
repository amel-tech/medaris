"use client";

import type { RecordingResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { useLocale, useTranslations } from "next-intl";
import { lazy, Suspense, useState } from "react";
import {
  embedUrlOf,
  firstPlayable,
  groupByWeek,
  playerApiUrlOf,
  recordingAction,
} from "../recordings-model";
import { MediaPlayer } from "./media-player";
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
 * The "Ders kayıtları" tab of the course page (design tedris/24, MDRS-162):
 * a player over the course's recordings grouped by week, newest first. The
 * list is the API's — it already leaves out what this caller may not see — so
 * the tab only chooses what each row offers: a YouTube or Bunny recording
 * (MDRS-114) plays in the frame above, anything else opens at its host, one
 * still being prepared offers nothing. A Bunny recording's address is the
 * player link the API signed for this viewer in this response. For an
 * enrolled talebe (`notes`) the player has their private notes panel beside
 * it (MDRS-150).
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
        <div
          className={
            notes
              ? "grid items-start gap-6 grid-cols-[minmax(0,1fr)_minmax(0,24rem)] max-lg:grid-cols-1"
              : undefined
          }
        >
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
          {notes ? (
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
          ) : null}
        </div>
      ) : null}

      <section className="flex flex-col gap-3" aria-labelledby="all-recordings">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 className="mds-h2" id="all-recordings">
            {t("allTitle")}
          </h2>
          <span className="mds-caption">{t("allHint")}</span>
        </div>
        {groupByWeek(recordings).map((group) => (
          <section
            key={group.weekId}
            className="mds-card flex flex-col gap-3"
            aria-labelledby={`week-${group.weekId}`}
          >
            <div className="flex flex-col gap-1">
              <p className="mds-eyebrow">
                {t("weekLabel", { number: group.weekNumber })}
              </p>
              <h3 className="mds-h3" id={`week-${group.weekId}`} dir="auto">
                {group.weekTitle}
              </h3>
            </div>
            <ul className="m-0 flex list-none flex-col p-0">
              {group.items.map((rec) => {
                const action = recordingAction(rec);
                const current = rec.id === selectedId && action === "play";
                const provider = PROVIDER_NAMES[rec.provider];
                const preparing = rec.status !== "READY";
                return (
                  <li
                    key={rec.id}
                    className="flex flex-wrap items-center gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                  >
                    <Icon name="playCircle" size="sm" />
                    <span className="flex min-inline-0 flex-1 flex-col">
                      <span className="mds-label" dir="auto">
                        {rec.title}
                      </span>
                      <span className="mds-caption">
                        {preparing
                          ? `${rec.recordedAt ? `${date(new Date(rec.recordedAt))} · ` : ""}${t("preparingHint")}`
                          : facts(rec, false)}
                      </span>
                    </span>
                    <span className="flex flex-wrap items-center gap-2">
                      {rec.visibility === "PUBLIC" ? (
                        <span className="mds-badge mds-badge--outline">
                          {t("public")}
                        </span>
                      ) : null}
                      {preparing ? (
                        <span className="mds-badge mds-badge--secondary">
                          <Icon name="clock" size="sm" />
                          {t("preparing")}
                        </span>
                      ) : provider ? (
                        <span className="mds-platform-chip">{provider}</span>
                      ) : null}
                      {current ? (
                        <span className="mds-caption">{t("inPlayer")}</span>
                      ) : action === "play" ? (
                        <Button
                          variant="ghost"
                          size="small"
                          iconLeft={<Icon name="play" size="sm" />}
                          onClick={() => setSelectedId(rec.id)}
                          aria-label={t("playLabel", { title: rec.title })}
                        >
                          {t("play")}
                        </Button>
                      ) : action === "open" && rec.url ? (
                        <Button
                          variant="outline"
                          size="small"
                          href={rec.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          iconRight={<Icon name="externalLink" size="sm" />}
                        >
                          {t("open")}
                          <span className="mds-visually-hidden">
                            {t("openLabel", { title: rec.title })}
                          </span>
                        </Button>
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </section>
    </div>
  );
};
