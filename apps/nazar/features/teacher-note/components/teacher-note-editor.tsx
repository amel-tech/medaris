"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Markdown } from "@medaris/ui/mds/markdown";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { saveTeacherNote } from "../actions";
import {
  TEACHER_NOTE_MAX,
  teacherNoteBody,
  teacherNoteChanged,
  teacherNoteLength,
  teacherNoteTooLong,
} from "../teacher-note";

/**
 * The müderris's note of one session: the Markdown as typed, how the talebe
 * will read it beside it, and "Notu kaydet". Saving an empty note removes it.
 */
export function TeacherNoteEditor({
  lessonId,
  note,
}: {
  lessonId: string;
  /** The note as tedrisat keeps it; null when the session has none. */
  note: string | null;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(note);
  const [draft, setDraft] = useState(note ?? "");
  const [failure, setFailure] = useState<string | null>(null);
  const dirty = teacherNoteChanged(draft, saved);
  const tooLong = teacherNoteTooLong(draft);

  // Leaving with an unsaved note asks first, as any editor does.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || tooLong) return;
    setFailure(null);
    const body = teacherNoteBody(draft);
    startTransition(async () => {
      const outcome = await saveTeacherNote(lessonId, body);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words("TeacherNote.failed"));
        return;
      }
      setSaved(outcome.data.body);
      setDraft(outcome.data.body ?? "");
      notify({
        tone: "success",
        title: words(
          outcome.data.body === null
            ? "TeacherNote.removed"
            : "TeacherNote.saved"
        ),
      });
    });
  };

  return (
    <form className="flex flex-col gap-6" onSubmit={submit} noValidate>
      <div className="grid grid-cols-2 gap-6 max-lg:grid-cols-1">
        <div className="flex flex-col gap-2">
          <Field
            label={words("TeacherNote.body")}
            help={words("TeacherNote.bodyHelp")}
            error={
              tooLong
                ? words("TeacherNote.tooLong", { max: TEACHER_NOTE_MAX })
                : undefined
            }
          >
            <Textarea
              name="body"
              dir="auto"
              rows={18}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </Field>
          <p className="mds-caption text-neutral-muted">
            {words("TeacherNote.count", {
              used: teacherNoteLength(draft),
              max: TEACHER_NOTE_MAX,
            })}
          </p>
        </div>
        <section
          className="flex flex-col gap-2"
          aria-label={words("TeacherNote.preview")}
        >
          <h2 className="mds-label">{words("TeacherNote.preview")}</h2>
          <div className="flex flex-col gap-3 rounded-control border border-neutral-subtle bg-neutral-sunken p-4">
            {draft.trim() === "" ? (
              <p className="mds-body-sm text-neutral-muted">
                {words("TeacherNote.previewEmpty")}
              </p>
            ) : (
              <Markdown source={draft} />
            )}
          </div>
        </section>
      </div>
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" loading={pending} disabled={tooLong}>
          {words("TeacherNote.save")}
        </Button>
        {dirty ? (
          <output className="mds-caption">
            {words("TeacherNote.unsaved")}
          </output>
        ) : null}
      </div>
    </form>
  );
}
