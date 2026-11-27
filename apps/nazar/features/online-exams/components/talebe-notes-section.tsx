"use client";

import type { ExamQuestionNoteResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useId, useState } from "react";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { paragraphDir, textProps } from "../arabic";
import { replyQuestionNote } from "../notes-actions";
import {
  NOTE_TEXT_MAX,
  NOTES_ANCHOR,
  teacherOrder,
  unansweredOf,
} from "../question-notes";
import { ArabicText } from "./arabic-text";

/**
 * "Talebe notları" of a çalışma seti or an exam (MDRS-248): the notes its
 * talebe sent to the hoca, the ones waiting for an answer first, each with
 * its question's number and the start of its text, the talebe's name, the
 * note and when it was sent. Each takes a short answer in place: "Cevapla",
 * then "Cevabı düzenle" and "Cevabı kaldır". The same part on a set's and an
 * exam's page, draft or published; `notes` is null when the read failed.
 */
export function TalebeNotesSection({
  notes: initial,
}: {
  notes: ExamQuestionNoteResponse[] | null;
}) {
  const t = useTranslations("nazar.QuestionNotes");
  const [notes, setNotes] = useState(() =>
    initial ? [...initial].sort(teacherOrder) : null
  );
  // A newer read of the page (after a save that renewed the session) brings
  // the notes sent since.
  useEffect(() => {
    if (initial) setNotes([...initial].sort(teacherOrder));
  }, [initial]);
  const replace = (next: ExamQuestionNoteResponse) =>
    setNotes((all) =>
      all
        ? all.map((n) => (n.id === next.id ? next : n)).sort(teacherOrder)
        : all
    );
  const waiting = notes ? unansweredOf(notes) : 0;
  return (
    <section
      id={NOTES_ANCHOR}
      className="flex scroll-mt-4 flex-col gap-3"
      aria-labelledby={`${NOTES_ANCHOR}-title`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 id={`${NOTES_ANCHOR}-title`} className="mds-h2">
          {t("title")}
        </h2>
        {waiting > 0 ? (
          <Badge variant="warning">{t("waiting", { count: waiting })}</Badge>
        ) : null}
      </div>
      <p className="mds-body-sm max-inline-measure text-neutral-muted">
        {t("intro")}
      </p>
      {notes === null ? (
        <p className="mds-body-sm text-neutral-muted">{t("loadFailed")}</p>
      ) : notes.length === 0 ? (
        <EmptyState icon={<Icon name="chat" size="lg" />}>
          {t("empty")}
        </EmptyState>
      ) : (
        <ol className="flex list-none flex-col gap-2 ps-0">
          {notes.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} onAnswered={replace} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function NoteCard({
  note,
  onAnswered,
}: {
  note: ExamQuestionNoteResponse;
  onAnswered: (next: ExamQuestionNoteResponse) => void;
}) {
  const t = useTranslations("nazar.QuestionNotes");
  const format = useFormatter();
  const { notify } = useToaster();
  const router = useRouter();
  const uid = useId();
  const answered = note.teacherReply !== null;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(note.teacherReply ?? "");
  const [sending, setSending] = useState<"reply" | "remove" | null>(null);
  const when = (at: Date | string) =>
    format.dateTime(new Date(at), { dateStyle: "medium", timeStyle: "short" });
  const name = note.talebe.name ?? t("noName");

  const send = async (reply: string, how: "reply" | "remove") => {
    if (sending) return;
    setSending(how);
    try {
      const result = await replyQuestionNote(note.id, reply);
      if (handleUnauthenticated(result as never)) return;
      if (!("data" in result)) {
        notify({
          tone: "error",
          title: how === "remove" ? t("removeFailed") : t("replyFailed"),
          description:
            "code" in result && result.code === "QUESTION_NOTE_NOT_FOUND"
              ? t("noteGone")
              : undefined,
        });
        return;
      }
      setEditing(false);
      // A removed answer stays in the field, so a slip is typed back at once.
      if (how === "reply") setText(result.data.teacherReply ?? "");
      onAnswered(result.data);
      // The page's own count ("N cevapsız talebe notu" under the title) is
      // the server's: it is read again.
      router.refresh();
      notify({
        tone: "success",
        title: how === "remove" ? t("removed") : t("replied"),
      });
    } catch {
      notify({
        tone: "error",
        title: how === "remove" ? t("removeFailed") : t("replyFailed"),
      });
    } finally {
      setSending(null);
    }
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const reply = text.trim();
    if (reply === "" || sending) return;
    void send(reply, "reply");
  };

  return (
    <article
      className="mds-card flex flex-col gap-2 px-4 py-3"
      aria-labelledby={`${uid}-head`}
      data-note={note.id}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <strong id={`${uid}-head`} className="shrink-0">
          {t("questionNumber", { number: note.questionNumber })}
        </strong>
        {/* The question cut to one line: the note is what is read here. */}
        <span
          className="mds-body-sm min-inline-0 flex-1 basis-[12rem] truncate text-neutral-muted"
          dir={paragraphDir(note.questionText)}
        >
          <ArabicText text={note.questionText} />
        </span>
        {answered ? (
          <Badge variant="success">{t("answered")}</Badge>
        ) : (
          <Badge variant="warning">{t("unanswered")}</Badge>
        )}
        {note.editedAfterReply ? (
          <Badge variant="outline">{t("editedAfterReply")}</Badge>
        ) : null}
      </div>
      <p className="mds-body-sm text-neutral-muted">
        <bdi>{name}</bdi>
        {" · "}
        <time dateTime={new Date(note.sharedAt).toISOString()}>
          {t("sentAt", { when: when(note.sharedAt) })}
        </time>
      </p>
      <p className="mds-body whitespace-pre-wrap" dir={paragraphDir(note.body)}>
        <ArabicText text={note.body} />
      </p>
      {answered && !editing ? (
        <div className="flex flex-col gap-2 border-s-2 border-neutral-subtle ps-3">
          <p className="mds-caption text-neutral-muted">
            {note.repliedAt
              ? t("yourReplyAt", { when: when(note.repliedAt) })
              : t("yourReply")}
          </p>
          <p
            className="mds-body whitespace-pre-wrap"
            dir={paragraphDir(note.teacherReply ?? "")}
          >
            <ArabicText text={note.teacherReply ?? ""} />
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              size="small"
              variant="outline"
              disabled={sending !== null}
              onClick={() => {
                setText(note.teacherReply ?? "");
                setEditing(true);
              }}
            >
              {t("editReply")}
            </Button>
            <Button
              size="small"
              variant="ghost"
              loading={sending === "remove"}
              onClick={() => void send("", "remove")}
            >
              {t("removeReply")}
            </Button>
          </div>
        </div>
      ) : (
        <form
          className="flex flex-col gap-2"
          onSubmit={submit}
          noValidate
          aria-label={t("replyLabel", { number: note.questionNumber, name })}
        >
          <Textarea
            aria-label={t("replyLabel", {
              number: note.questionNumber,
              name,
            })}
            placeholder={t("replyPlaceholder")}
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            maxLength={NOTE_TEXT_MAX}
            {...textProps(text)}
            className="field-sizing-content"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              type="submit"
              size="small"
              disabled={text.trim() === ""}
              loading={sending === "reply"}
            >
              {answered ? t("saveReply") : t("reply")}
            </Button>
            {editing ? (
              <Button
                size="small"
                variant="ghost"
                onClick={() => {
                  setText(note.teacherReply ?? "");
                  setEditing(false);
                }}
              >
                {t("cancel")}
              </Button>
            ) : null}
          </div>
        </form>
      )}
    </article>
  );
}
