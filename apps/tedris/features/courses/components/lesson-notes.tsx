"use client";

import type { LessonNoteResponse } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
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
  sortNotes,
} from "../lesson-note-model";
import { NoteMarkdown } from "../note-markdown";
import { type PlayerControl, useYouTubePlayer } from "../youtube-player";

type Load = { state: "loading" } | { state: "failed" } | { state: "ready" };

/** A body and a time field, as typed. */
interface Draft {
  body: string;
  time: string;
}

/**
 * The talebe's private notes next to a session's video (MDRS-150, designs
 * tedris/15 and 24). One panel for the live stream and the recording of a
 * session: the notes belong to the session, and a note's time is the position
 * from the start of the video, so one taken on the stream points at the same
 * moment in the recording.
 *
 * `frameId` names the YouTube frame on the page. With it the panel reads the
 * player's position for a new note and a note's time seeks the player; without
 * it (Drive and other hosts report no position) the time is typed, and may be
 * left empty. Only the author's notes ever reach the panel: the API returns no
 * others.
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
      className="mds-card flex flex-col gap-4"
      aria-labelledby={`notes-${lessonId}`}
    >
      <div className="mds-card__header flex flex-col gap-1">
        <h2
          className="mds-card__title flex items-center gap-2"
          id={`notes-${lessonId}`}
        >
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
        <ul className="m-0 flex list-none flex-col p-0">
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
      className="flex flex-col gap-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field
        label={t("bodyLabel")}
        help={t("bodyHelp", { max: LESSON_NOTE_BODY_MAX })}
      >
        <Textarea
          rows={3}
          dir="auto"
          maxLength={LESSON_NOTE_BODY_MAX}
          value={draft.body}
          onChange={(event) =>
            setDraft((d) => ({ ...d, body: event.target.value }))
          }
          onFocus={() => {
            // The moment the talebe starts writing is the moment the note is
            // about, unless they already gave a time themselves.
            if (!touched && draft.time === "") takePosition();
          }}
        />
      </Field>
      <div className="flex flex-wrap items-end gap-3">
        <Field
          label={t("timeLabel")}
          help={player ? t("timeHelpPlayer") : t("timeHelpManual")}
          className="flex-1"
        >
          <Input
            mono
            inputMode="numeric"
            autoComplete="off"
            placeholder="12:34"
            value={draft.time}
            onChange={(event) => {
              setTouched(true);
              setDraft((d) => ({ ...d, time: event.target.value }));
            }}
          />
        </Field>
        {player ? (
          <Button
            variant="outline"
            size="small"
            iconLeft={<Icon name="clock" size="sm" />}
            onClick={() => {
              setTouched(true);
              takePosition();
            }}
          >
            {t("useCurrent")}
          </Button>
        ) : null}
      </div>
      {error ? (
        <p className="mds-error" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button
          type="submit"
          size="small"
          iconLeft={<Icon name="plus" size="sm" />}
          loading={saving}
          loadingLabel={t("saving")}
        >
          {t("add")}
        </Button>
      </div>
    </form>
  );
};

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

  if (mode === "edit") {
    return (
      <li className="flex flex-col gap-3 py-3 border-be border-neutral-subtle last:border-be-0">
        <Field label={t("bodyLabel")}>
          <Textarea
            rows={3}
            dir="auto"
            maxLength={LESSON_NOTE_BODY_MAX}
            value={draft.body}
            onChange={(event) =>
              setDraft((d) => ({ ...d, body: event.target.value }))
            }
          />
        </Field>
        <Field label={t("timeLabel")} help={t("timeHelpManual")}>
          <Input
            mono
            inputMode="numeric"
            autoComplete="off"
            placeholder="12:34"
            value={draft.time}
            onChange={(event) =>
              setDraft((d) => ({ ...d, time: event.target.value }))
            }
          />
        </Field>
        {error ? (
          <p className="mds-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
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
      </li>
    );
  }

  const seek = note.offsetSeconds;
  const time = seek === null ? t("noTime") : formatOffset(seek);
  return (
    <li className="flex flex-col gap-2 py-3 border-be border-neutral-subtle last:border-be-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {player && seek !== null ? (
          <Button
            variant="ghost"
            size="mini"
            iconLeft={<Icon name="play" size="sm" />}
            onClick={() => player.seekTo(seek)}
            aria-label={t("seekLabel", { time })}
          >
            <span className="mds-num">{time}</span>
          </Button>
        ) : (
          <span className="mds-badge mds-badge--outline mds-num">{time}</span>
        )}
        {mode === "confirm" ? (
          <span className="flex flex-wrap items-center gap-2">
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
        ) : (
          <span className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="mini"
              iconLeft={<Icon name="edit" size="sm" />}
              onClick={edit}
              aria-label={t("editLabel", { time })}
            >
              {t("edit")}
            </Button>
            <Button
              variant="ghost"
              size="mini"
              iconLeft={<Icon name="trash" size="sm" />}
              onClick={() => {
                setError(null);
                setMode("confirm");
              }}
              aria-label={t("deleteLabel", { time })}
            >
              {t("delete")}
            </Button>
          </span>
        )}
      </div>
      <NoteMarkdown source={note.body} />
      {error ? (
        <p className="mds-error" role="alert">
          {error}
        </p>
      ) : null}
    </li>
  );
};
