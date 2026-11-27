"use client";

import type { MyQuestionNoteResponse } from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Switch } from "@medaris/ui/mds/switch";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";
import { ArabicText } from "~/features/online-exams/components/arabic-text";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { deleteMyQuestionNote, saveMyQuestionNote } from "../actions";
import {
  NOTE_MAX,
  type NoteError,
  noteErrorOf,
  noteLookOf,
} from "../note-model";

type Note = MyQuestionNoteResponse;

const failure = (result: unknown): { status?: number; code?: string } =>
  result as { status?: number; code?: string };

/**
 * A question's note (MDRS-248, soru notları): an icon in the question's top
 * line, outlined while there is no note, tinted once there is one, with a dot
 * when the hoca answered it. It opens a small panel over what is under it
 * (the options and the buttons do not move): the hoca's answer, the note
 * (≤1000, counted), "Hocaya gönder" and Kaydet / Sil, each written at once.
 *
 * The panel is not modal: Esc and the icon close it, a click outside it too,
 * and the focus goes back to the icon. It is a `role="dialog"`, so the
 * question screen's keys (A–Z, 1–9, Enter) leave its text alone. The parent
 * holds the note (`note`, `onChange`) and must be the panel's anchor: the
 * element that holds the icon carries `question-note-anchor`.
 *
 * `shareLock` is a sitting of an exam: sending waits until the exam is over
 * for everyone, so the switch is off and says why; a personal note may be
 * written. `enabled` false is a question the hoca turned notes off on: a
 * note written before is read and deleted, not written.
 */
export function QuestionNote({
  questionId,
  questionNumber,
  note,
  onChange,
  enabled,
  shareLock = false,
}: {
  questionId: string;
  questionNumber: number;
  note: Note | null;
  onChange: (note: Note | null) => void;
  enabled: boolean;
  shareLock?: boolean;
}) {
  const t = useTranslations("tedris.QuestionNotes");
  const uid = useId();
  const panelId = `${uid}-panel`;
  const titleId = `${uid}-title`;
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState(note?.body ?? "");
  const [shared, setShared] = useState(note?.sharedWithTeacher ?? false);
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<NoteError | null>(null);
  const [status, setStatus] = useState<"saved" | "deleted" | null>(null);
  // The server's word wins over the props: a lock it reported stays.
  const [lockedBy, setLockedBy] = useState<"exam" | null>(null);
  const [off, setOff] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // The mds Textarea takes no ref: the panel's one textarea is found in it.
  const textOf = () => panelRef.current?.querySelector("textarea") ?? null;

  const writable = enabled && !off;
  const locked = shareLock || lockedBy === "exam";
  const look = noteLookOf(note);

  const close = (focusBack = true) => {
    setOpen(false);
    if (focusBack) buttonRef.current?.focus();
  };

  // Opened: the text takes the focus. A draft not saved is kept across a
  // close (an outside press, Esc, "Sonraki"), so nothing typed is lost.
  const show = () => {
    setError(null);
    setStatus(null);
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const el = textOf();
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange?.(end, end);
    } else {
      panelRef.current?.focus();
    }
  }, [open]);

  // A press outside the icon and the panel closes it, the focus staying
  // where it went; Esc closes it wherever the focus is, back to the icon.
  // Neither while "Sil" asks: its dialog is outside the panel.
  useEffect(() => {
    if (!open || confirming) return;
    const onDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (panelRef.current?.contains(target)) return;
      if (buttonRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, confirming]);

  const trimmed = body.trim();
  // While sending is locked, a note already sent stays sent: the API keeps it
  // sent only when the request says so.
  const sending = locked ? (note?.sharedWithTeacher ?? false) : shared;
  const changed =
    trimmed !== (note?.body ?? "") ||
    sending !== (note?.sharedWithTeacher ?? false);

  const save = async () => {
    if (!writable || busy || trimmed === "" || !changed) return;
    setBusy("save");
    setError(null);
    setStatus(null);
    try {
      const result = await saveMyQuestionNote(questionId, trimmed, sending);
      if (sendToSignIn(result)) return;
      if (result.success) {
        onChange(result.data);
        setBody(result.data.body);
        setShared(result.data.sharedWithTeacher);
        setStatus("saved");
        return;
      }
      const why = noteErrorOf(failure(result), "save");
      if (why === "shareLocked") {
        setLockedBy("exam");
        setShared(false);
      }
      if (why === "disabled") setOff(true);
      setError(why);
    } catch {
      setError("saveFailed");
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!note || busy) return;
    setBusy("delete");
    setError(null);
    setStatus(null);
    try {
      const result = await deleteMyQuestionNote(questionId);
      if (sendToSignIn(result)) return;
      // Already gone is what was asked for.
      if (
        result.success ||
        failure(result).code === "QUESTION_NOTE_NOT_FOUND"
      ) {
        onChange(null);
        setBody("");
        setShared(false);
        setStatus("deleted");
        textOf()?.focus();
        return;
      }
      setError(noteErrorOf(failure(result), "delete"));
    } catch {
      setError("deleteFailed");
    } finally {
      setBusy(null);
    }
  };

  const label = t(
    look === "empty"
      ? "buttonLabel"
      : look === "written"
        ? "buttonLabelWritten"
        : look === "newReply"
          ? "buttonLabelNewReply"
          : "buttonLabelReplied",
    { number: questionNumber }
  );

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="mds-btn mds-btn--ghost mds-btn--small mds-icon-btn question-note__button"
        data-look={look}
        aria-label={label}
        title={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
        data-testid="question-note-button"
        onClick={() => (open ? close() : show())}
      >
        <Icon name="note" size="sm" />
        {look === "replied" || look === "newReply" ? (
          <span
            className="question-note__dot"
            data-new={look === "newReply" ? "true" : undefined}
            aria-hidden="true"
          />
        ) : null}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-labelledby={titleId}
          tabIndex={-1}
          className="question-note__panel flex flex-col gap-3"
          data-testid="question-note-panel"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              close();
            }
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h3 id={titleId} className="mds-body-sm font-semibold">
              {t("panelTitle", { number: questionNumber })}
            </h3>
            <button
              type="button"
              className="mds-btn mds-btn--ghost mds-btn--small mds-icon-btn"
              aria-label={t("close")}
              title={t("close")}
              onClick={() => close()}
            >
              <Icon name="close" size="sm" />
            </button>
          </div>

          {note?.teacherReply ? (
            <TeacherReply reply={note.teacherReply} />
          ) : null}

          {writable ? (
            <Field
              label={t("bodyLabel")}
              help={
                <span className="mds-num" aria-live="polite">
                  {t("counter", { count: body.length, max: NOTE_MAX })}
                </span>
              }
            >
              <Textarea
                dir="auto"
                rows={4}
                maxLength={NOTE_MAX}
                value={body}
                placeholder={t("bodyPlaceholder")}
                onChange={(event) => {
                  setBody(event.currentTarget.value);
                  setStatus(null);
                }}
                onKeyDown={(event) => {
                  // Ctrl/⌘ + Enter saves, as in a chat box; Enter is a new line.
                  if (
                    event.key === "Enter" &&
                    (event.ctrlKey || event.metaKey)
                  ) {
                    event.preventDefault();
                    void save();
                  }
                }}
                data-testid="question-note-body"
              />
            </Field>
          ) : (
            <>
              <p className="mds-body-sm" role="note">
                {t("disabled")}
              </p>
              {note ? <NoteBody body={note.body} /> : null}
            </>
          )}

          {writable ? (
            <Switch
              label={t("share")}
              description={locked ? t("shareLockedExam") : t("shareHelp")}
              checked={sending}
              disabled={locked}
              onCheckedChange={(checked: boolean) => {
                setShared(checked);
                setStatus(null);
              }}
              data-testid="question-note-share"
            />
          ) : null}

          {error ? (
            <p className="mds-error" role="alert">
              {t(error)}
            </p>
          ) : null}
          <p className="mds-caption text-neutral-muted" aria-live="polite">
            {status ? t(status) : ""}
          </p>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {note ? (
              <Button
                size="small"
                variant="ghost"
                loading={busy === "delete"}
                disabled={busy !== null}
                onClick={() =>
                  // The hoca's answer goes with the note: asked first.
                  note.teacherReply ? setConfirming(true) : void remove()
                }
              >
                {t("delete")}
              </Button>
            ) : null}
            {writable ? (
              <Button
                size="small"
                loading={busy === "save"}
                disabled={busy !== null || trimmed === "" || !changed}
                onClick={() => void save()}
              >
                {t("save")}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
      <AlertDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={t("deleteTitle")}
        confirmLabel={t("delete")}
        confirmVariant="destructive"
        cancelLabel={t("cancel")}
        onConfirm={() => {
          setConfirming(false);
          void remove();
        }}
      >
        <p>{t("deleteBody")}</p>
      </AlertDialog>
    </>
  );
}

/** A note's text, by the Arabic text standard. */
export function NoteBody({ body }: { body: string }) {
  return (
    <ArabicText
      as="p"
      className="mds-body-sm whitespace-pre-line"
      size="var(--fs-body-sm)"
      text={body}
    />
  );
}

/** "Hocanın cevabı:" and the answer. */
export function TeacherReply({ reply }: { reply: string }) {
  const t = useTranslations("tedris.QuestionNotes");
  return (
    <div className="question-note__reply flex flex-col gap-1">
      <p className="mds-caption font-semibold">{t("teacherReply")}</p>
      <ArabicText
        as="p"
        className="mds-body-sm whitespace-pre-line"
        size="var(--fs-body-sm)"
        text={reply}
      />
    </div>
  );
}

/**
 * A note under an answered question, on a result screen: the note, whether
 * it was sent, and the hoca's answer. Nothing when there is no note.
 */
export function QuestionNoteSummary({ note }: { note: Note | null }) {
  const t = useTranslations("tedris.QuestionNotes");
  if (!note) return null;
  return (
    <div
      className="question-note__summary flex flex-col gap-2"
      data-testid="question-note-summary"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="mds-caption font-semibold">{t("yourNote")}</span>
        <Badge variant={note.sharedWithTeacher ? "info" : "secondary"}>
          {t(note.sharedWithTeacher ? "sharedBadge" : "personalBadge")}
        </Badge>
        {note.newReply ? (
          <Badge variant="warning">{t("newReplyBadge")}</Badge>
        ) : null}
      </div>
      <NoteBody body={note.body} />
      {note.teacherReply ? <TeacherReply reply={note.teacherReply} /> : null}
    </div>
  );
}
