"use client";

import type { ExamKind } from "@medaris/services/tedrisat";
import { Icon } from "@medaris/ui/mds/icon";
import { useToaster } from "@medaris/ui/mds/toast";
import { Tooltip } from "@medaris/ui/mds/tooltip";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { setExamQuestionTalebeNotes } from "../notes-actions";
import { takesNotes } from "../question-notes";

/**
 * The talebe-notes icon of one question (MDRS-248): a small toggle beside
 * the question, never a field of its own ("ikon olarak dursun, tıklanırsa
 * soruya eklensin, gereksiz yer kaplamasın"). Its name stays "Talebe
 * notları" and `aria-pressed` says the state, as a toggle's name must not
 * change with it; to the eye, a bubble when on and the bubble struck through
 * when off, so the state is never only a colour. The tooltip says which:
 * "Talebe not ekleyebilir" / "Talebe notu kapalı". It is IconButton's markup
 * written out, since IconButton names the button by its tooltip.
 *
 * The system's IconButton draws a pressed toggle with its glyph's fill twin,
 * and the sprite has one only for star, play and bookmark; the stroke is
 * this screen's stand-in until `chat` has one (see the migration note).
 */
export function TalebeNotesToggle({
  on,
  disabled,
  onToggle,
}: {
  on: boolean;
  disabled?: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("nazar.QuestionNotes");
  return (
    <Tooltip label={on ? t("toggleOn") : t("toggleOff")}>
      <button
        type="button"
        className="mds-btn mds-icon-btn mds-btn--small mds-btn--ghost"
        aria-label={t("toggleName")}
        aria-pressed={on}
        data-talebe-notes={on ? "on" : "off"}
        disabled={disabled}
        onClick={onToggle}
      >
        <span className="relative inline-flex" aria-hidden="true">
          <Icon name="chat" size="sm" />
          {on ? null : (
            <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <span className="block h-0.5 w-[130%] shrink-0 rotate-45 rounded-full bg-current" />
            </span>
          )}
        </span>
      </button>
    </Tooltip>
  );
}

/**
 * The icon on a published set's or exam's question, which no editor holds:
 * it calls the API at once and shows the new state before the answer, and
 * takes it back with a toast when the write fails.
 */
export function QuestionNotesSwitch({
  examId,
  kind,
  question,
}: {
  examId: string;
  kind: ExamKind;
  question: { id: string; talebeNotes?: boolean };
}) {
  const t = useTranslations("nazar.QuestionNotes");
  const { notify } = useToaster();
  const [on, setOn] = useState(() => takesNotes(question, kind));
  // A newer read of the page brings the server's state, unless a write of
  // this page's own is on its way.
  const writing = useRef(false);
  const server = takesNotes(question, kind);
  useEffect(() => {
    if (!writing.current) setOn(server);
  }, [server]);
  // One write at a time: a click while one is on its way is not taken (the
  // button stays focusable, so the keyboard does not lose its place).
  const toggle = async () => {
    if (writing.current) return;
    const next = !on;
    setOn(next);
    writing.current = true;
    const back = () => {
      setOn(!next);
      notify({ tone: "error", title: t("toggleFailed") });
    };
    try {
      const result = await setExamQuestionTalebeNotes(
        examId,
        question.id,
        next
      );
      if (handleUnauthenticated(result as never)) return setOn(!next);
      if (!("data" in result)) return back();
      setOn(result.data.talebeNotes);
    } catch {
      back();
    } finally {
      writing.current = false;
    }
  };
  return <TalebeNotesToggle on={on} onToggle={() => void toggle()} />;
}
