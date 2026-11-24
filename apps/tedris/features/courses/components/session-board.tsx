"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { sendToSignIn } from "~/lib/send-to-sign-in";
import { getLessonBoard } from "../actions/material";
import { type BoardFact, boardFact, boardIsEmpty } from "../board-model";
import { BoardCanvas } from "./board-canvas";

/**
 * The session's board on the talebe's session page: what the müderris drew
 * and saved in nazar-web, read only (it can be panned and zoomed, nothing
 * else). A session with no board, or one that could not be read, draws
 * nothing: the board is an extra of the session, never a hole in its page.
 */
export function SessionBoard({ lessonId }: { lessonId: string }) {
  const t = useTranslations("tedrisLearn.SessionBoard");
  const locale = useLocale();
  const [board, setBoard] = useState<BoardFact | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const result = await getLessonBoard(lessonId);
        if (cancelled || sendToSignIn(result) || !result.success) return;
        const fact = boardFact(result.data);
        if (!boardIsEmpty(fact)) setBoard(fact);
      } catch {
        // No board is drawn; the rest of the page stands.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId]);

  if (!board) return null;
  return (
    <section className="flex flex-col gap-3" data-testid="session-board">
      <h2 className="mds-h3">{t("title")}</h2>
      <p className="mds-caption">{t("hint")}</p>
      <BoardCanvas
        lessonId={lessonId}
        board={board}
        readOnly
        locale={locale}
        labels={{
          canvas: t("canvas"),
          loading: t("loading"),
          imagesFailed: t("imagesFailed"),
        }}
      />
    </section>
  );
}
