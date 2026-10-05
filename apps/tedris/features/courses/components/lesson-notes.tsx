"use client";

import type { LessonNoteResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { Markdown } from "@medaris/ui/mds/markdown";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useState } from "react";
import {
  createLessonNote,
  deleteLessonNote,
  listLessonNotes,
  updateLessonNote,
} from "../actions/notes";
import {
  formatOffset,
  LESSON_NOTE_BODY_MAX,
  parseOffset,
  showsBodyCount,
  sortNotes,
} from "../lesson-note-model";
import { type PlayerControl, useYouTubePlayer } from "../youtube-player";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready" };

/** A body and a time field, as typed. */
interface Draft {
  body: string;
  time: string;
}

/**
 * A note's text grows with what is typed, from two lines to about ten, where
 * the browser can size a field to its content (`field-sizing`); elsewhere it
 * stays at two lines and can be dragged taller (MDRS-280).
 */
const GROWING =
  "field-sizing-content min-block-[calc(2lh+1.125rem)] max-block-[calc(10lh+1.125rem)]";

/**
 * The talebe's private notes under a session's video (MDRS-150, designs
 * tedris/15 and 24; laid out for use while watching in MDRS-280). One panel
 * for the live stream and the recording of a session: the notes belong to the
 * session, and a note's time is the position from the start of the video, so
 * one taken on the stream points at the same moment in the recording.
 *
 * `frameId` names the YouTube frame on the page. With it the panel reads the
 * player's position for a new note and a note's time seeks the player; without
 * it (Bunny, Drive and other hosts report no position) the time is typed, and
 * may be left empty. Only the author's notes ever reach the panel: the API
 * returns no others.
 */
export function LessonNotes({
  lessonId,
  frameId = null,
}: {
  lessonId: string;
  frameId?: string | null;
}) {
  const t = useTranslations("tedrisLearn.LessonNotes");
  const player = useYouTubePlayer(frameId);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [notes, setNotes] = useState<LessonNoteResponse[]>([]);

  const read = useCallback(async () => {
    setLoad({ state: "loading" });
    try {
      const result = await listLessonNotes(lessonId);
      if (result.success) {
        setNotes(sortNotes(result.data));
        setLoad({ state: "ready" });
      } else {
        setLoad({ state: "failed" });
      }
    } catch {
      setLoad({ state: "failed" });
    }
  }, [lessonId]);

  useEffect(() => {
    void read();
  }, [read]);

  const put = (note: LessonNoteResponse) =>
    setNotes((all) =>
      sortNotes([...all.filter((n) => n.id !== note.id), note])
    );

  return (
    <section
      className="mds-card @container flex flex-col gap-3"
      aria-labelledby={`notes-${lessonId}`}
    >
      {/* One line: the panel's name and, beside it, who reads it. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="mds-h3 flex items-center gap-2" id={`notes-${lessonId}`}>
          <Icon name="note" />
          {t("title")}
        </h2>
        <p className="mds-caption">{t("private")}</p>
      </div>

      <NoteForm lessonId={lessonId} player={player} onSaved={put} />

      {load.state === "loading" ? (
        <output className="mds-caption">{t("loading")}</output>
      ) : load.state === "failed" ? (
        <div className="flex flex-col gap-2" role="alert">
          <p className="mds-body-sm">{t("loadFailed")}</p>
          <div>
            <Button variant="outline" size="small" onClick={() => void read()}>
              {t("retry")}
            </Button>
          </div>
        </div>
      ) : notes.length === 0 ? (
        <p className="mds-caption">{t("empty")}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0 border-bs border-neutral-subtle">
          {notes.map((note) => (
            <NoteItem
              key={note.id}
              note={note}
              player={player}
              onSaved={put}
              onDeleted={(id) =>
                setNotes((all) => all.filter((n) => n.id !== id))
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/** What a failed write says: refused (not enrolled any more) or just failed. */
const useWriteError = () => {
  const t = useTranslations("tedrisLearn.LessonNotes");
  return (status: number | undefined) =>
    status === 403 ? t("forbidden") : t("saveFailed");
};

/**
 * The note's text. Its only help, that Markdown is welcome, shows once the
 * talebe writes, with the count of characters added near the API's limit.
 */
const BodyField = ({
  value,
  onChange,
  onFocus,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  placeholder?: string;
}) => {
  const t = useTranslations("tedrisLearn.LessonNotes");
  const help =
    value === ""
      ? undefined
      : showsBodyCount(value.length)
        ? `${t("bodyHint")} · ${t("bodyCount", { count: value.length, max: LESSON_NOTE_BODY_MAX })}`
        : t("bodyHint");
  return (
    <Field help={help}>
      <Textarea
        aria-label={t("bodyLabel")}
        rows={2}
        dir="auto"
        maxLength={LESSON_NOTE_BODY_MAX}
        placeholder={placeholder}
        className={GROWING}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
      />
    </Field>
  );
};

/** The moment of the video a note is about, as `12:34`: a small typed field. */
const TimeField = ({
  value,
  onChange,
  describedBy,
}: {
  value: string;
  onChange: (value: string) => void;
  /** The id of the line that says what the field takes. */
  describedBy: string;
}) => {
  const t = useTranslations("tedrisLearn.LessonNotes");
  return (
    <Field className="shrink-0 inline-[7.5rem]">
      <Input
        size="small"
        mono
        inputMode="numeric"
        autoComplete="off"
        aria-label={t("timeLabel")}
        aria-describedby={describedBy}
        placeholder={t("timePlaceholder")}
        leading={<Icon name="clock" size="sm" />}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );
};

const NoteForm = ({
  lessonId,
  player,
  onSaved,
}: {
  lessonId: string;
  player: PlayerControl | null;
  onSaved: (note: LessonNoteResponse) => void;
}) => {
  const t = useTranslations("tedrisLearn.LessonNotes");
  const writeError = useWriteError();
  const hintId = useId();
  const [draft, setDraft] = useState<Draft>({ body: "", time: "" });
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const takePosition = () => {
    const seconds = player?.position();
    if (seconds != null) {
      setDraft((d) => ({ ...d, time: formatOffset(seconds) }));
    }
  };

  const submit = async () => {
    const offset = parseOffset(draft.time);
    if (!offset.ok) return setError(t("invalidTime"));
    if (draft.body.trim() === "") return setError(t("bodyRequired"));
    setSaving(true);
    setError(null);
    try {
      const result = await createLessonNote(lessonId, {
        body: draft.body,
        offsetSeconds: offset.seconds,
      });
      if (result.success) {
        onSaved(result.data);
        setDraft({ body: "", time: "" });
        setTouched(false);
      } else {
        setError(writeError("status" in result ? result.status : undefined));
      }
    } catch {
      setError(writeError(undefined));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="flex flex-col gap-2"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <BodyField
        value={draft.body}
        placeholder={t("bodyPlaceholder")}
        onChange={(body) => setDraft((d) => ({ ...d, body }))}
        onFocus={() => {
          // The moment the talebe starts writing is the moment the note is
          // about, unless they already gave a time themselves.
          if (!touched && draft.time === "") takePosition();
        }}
      />
      <div className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <TimeField
            value={draft.time}
            describedBy={hintId}
            onChange={(time) => {
              setTouched(true);
              setDraft((d) => ({ ...d, time }));
            }}
          />
          {player ? (
            <>
              <Button
                variant="outline"
                size="small"
                onClick={() => {
                  setTouched(true);
                  takePosition();
                }}
              >
                {t("useCurrent")}
              </Button>
              <span className="mds-visually-hidden" id={hintId}>
                {t("timeHelpPlayer")}
              </span>
            </>
          ) : null}
          <Button
            type="submit"
            size="small"
            className="ms-auto"
            iconLeft={<Icon name="plus" size="sm" />}
            loading={saving}
            loadingLabel={t("saving")}
          >
            {t("add")}
          </Button>
        </div>
        {player ? null : (
          // Bunny, Drive and other hosts report no position: the talebe reads
          // it off the player, or leaves it out.
          <p className="mds-help" id={hintId}>
            {t("timeHelpManual")}
          </p>
        )}
      </div>
      {error ? (
        <p className="mds-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
};

/**
 * One note on the timeline: its time first (a button that moves the YouTube
 * player there, a label otherwise), its text after, its actions at the end.
 * In a narrow panel the text goes under the time and the actions.
 */
const NoteItem = ({
  note,
  player,
  onSaved,
  onDeleted,
}: {
  note: LessonNoteResponse;
  player: PlayerControl | null;
  onSaved: (note: LessonNoteResponse) => void;
  onDeleted: (id: string) => void;
}) => {
  const t = useTranslations("tedrisLearn.LessonNotes");
  const writeError = useWriteError();
  const hintId = useId();
  const [mode, setMode] = useState<"view" | "edit" | "confirm">("view");
  const [draft, setDraft] = useState<Draft>({ body: "", time: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const edit = () => {
    setDraft({
      body: note.body,
      time: note.offsetSeconds === null ? "" : formatOffset(note.offsetSeconds),
    });
    setError(null);
    setMode("edit");
  };

  const save = async () => {
    const offset = parseOffset(draft.time);
    if (!offset.ok) return setError(t("invalidTime"));
    if (draft.body.trim() === "") return setError(t("bodyRequired"));
    setBusy(true);
    setError(null);
    try {
      const result = await updateLessonNote(note.lessonId, note.id, {
        body: draft.body,
        offsetSeconds: offset.seconds,
      });
      if (result.success) {
        onSaved(result.data);
        setMode("view");
      } else {
        setError(writeError("status" in result ? result.status : undefined));
      }
    } catch {
      setError(writeError(undefined));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteLessonNote(note.lessonId, note.id);
      if (result.success) return onDeleted(note.id);
      setError(t("deleteFailed"));
    } catch {
      setError(t("deleteFailed"));
    }
    setBusy(false);
  };

  const errorLine = error ? (
    <p className="mds-error col-span-full" role="alert">
      {error}
    </p>
  ) : null;

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-2 py-3 border-be border-neutral-subtle last:border-be-0">
        <BodyField
          value={draft.body}
          onChange={(body) => setDraft((d) => ({ ...d, body }))}
        />
        <div className="flex flex-wrap items-center gap-2">
          <TimeField
            value={draft.time}
            describedBy={hintId}
            onChange={(time) => setDraft((d) => ({ ...d, time }))}
          />
          <span className="mds-visually-hidden" id={hintId}>
            {t("timeHelpManual")}
          </span>
          <Button
            size="small"
            loading={busy}
            loadingLabel={t("saving")}
            onClick={() => void save()}
          >
            {t("save")}
          </Button>
          <Button variant="ghost" size="small" onClick={() => setMode("view")}>
            {t("cancel")}
          </Button>
        </div>
        {errorLine}
      </li>
    );
  }

  const seek = note.offsetSeconds;
  const time = seek === null ? t("noTime") : formatOffset(seek);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1 py-3 border-be border-neutral-subtle last:border-be-0 @min-[30rem]:grid-cols-[5.5rem_minmax(0,1fr)_auto]">
      <span className="col-start-1 row-start-1 justify-self-start">
        {player && seek !== null ? (
          <Button
            variant="outline"
            size="mini"
            iconLeft={<Icon name="play" size="sm" />}
            onClick={() => player.seekTo(seek)}
            aria-label={t("seekLabel", { time })}
          >
            <span className="mds-num">{time}</span>
          </Button>
        ) : (
          <span
            className={`mds-badge mds-num ${seek === null ? "mds-badge--outline" : "mds-badge--secondary"}`}
          >
            {time}
          </span>
        )}
      </span>
      <div className="col-span-2 row-start-2 min-inline-0 @min-[30rem]:col-span-1 @min-[30rem]:col-start-2 @min-[30rem]:row-start-1">
        <Markdown source={note.body} />
      </div>
      <span className="col-start-2 row-start-1 flex items-center gap-1 justify-self-end @min-[30rem]:col-start-3">
        {mode === "confirm" ? null : (
          <>
            <IconButton
              size="mini"
              icon={<Icon name="edit" size="sm" />}
              label={t("editLabel", { time })}
              onClick={edit}
            />
            <IconButton
              size="mini"
              icon={<Icon name="trash" size="sm" />}
              label={t("deleteLabel", { time })}
              onClick={() => {
                setError(null);
                setMode("confirm");
              }}
            />
          </>
        )}
      </span>
      {mode === "confirm" ? (
        <span className="col-span-full flex flex-wrap items-center justify-end gap-2">
          <span className="mds-caption">{t("deleteAsk")}</span>
          <Button
            variant="destructive"
            size="mini"
            loading={busy}
            loadingLabel={t("deleting")}
            onClick={() => void remove()}
          >
            {t("delete")}
          </Button>
          <Button variant="ghost" size="mini" onClick={() => setMode("view")}>
            {t("cancel")}
          </Button>
        </span>
      ) : null}
      {errorLine}
    </li>
  );
};
