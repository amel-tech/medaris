"use client";

import { Markdown } from "@medaris/ui/mds/markdown";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { getLessonTeacherNote } from "../actions/material";

/**
 * The müderris's note of the session on the talebe's session page: the
 * Markdown written in nazar-web, read only. A session with no note, or one
 * that could not be read, draws nothing: the note is an extra of the session,
 * never a hole in its page.
 */
export function SessionTeacherNote({ lessonId }: { lessonId: string }) {
  const t = useTranslations("tedrisLearn.SessionTeacherNote");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getLessonTeacherNote(lessonId);
        if (cancelled || sendToSignIn(result) || !result.success) return;
        setNote(result.data.body);
      } catch {
        // No note is drawn; the rest of the page stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (!note) return null;
  return (
    <section className="flex flex-col gap-3" data-testid="session-teacher-note">
      <h2 className="mds-h3">{t("title")}</h2>
      <p className="mds-caption">{t("hint")}</p>
      <div className="flex flex-col gap-3 rounded-control border border-neutral-subtle bg-neutral-sunken p-4">
        <Markdown source={note} />
      </div>
    </section>
  );
}
