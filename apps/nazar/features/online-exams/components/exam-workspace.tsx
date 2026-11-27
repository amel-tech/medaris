"use client";

import type {
  ExamQuestionNoteResponse,
  OnlineExamDraftResponse,
  PracticeSetStatsResponse,
} from "@medaris/services/tedrisat";
import { useEffect, useState } from "react";
import { DeletePracticeSet } from "./delete-practice-set";
import { ExamEditor } from "./exam-editor";
import { PublishedExam } from "./exam-publish";
import { TalebeNotesSection } from "./talebe-notes-section";

/**
 * One online exam's page (MDRS-299): the editor while it is a draft, the
 * published exam once it is. Publishing and taking back answer the exam as
 * it now stands, so the page turns from one to the other without reading
 * it again.
 *
 * Neither is remounted when the page is read again: the router draws it
 * again after a save that renewed the session, and a remount would drop what
 * is being typed. A newer read is passed on, and the editor takes it when
 * nothing of its own is on its way.
 *
 * A çalışma seti ends with "Seti sil" (MDRS-248), draft or published, off
 * once a talebe started it (the API's `locked`, or figures that say so).
 * Before it, on a set and an exam alike, "Talebe notları" (MDRS-248).
 */
export function ExamWorkspace({
  courseId,
  draft,
  timeZone,
  locale,
  practiceStats,
  notes,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
  timeZone: string;
  locale: string;
  /** A çalışma seti's figures: null when nobody finished it, undefined when unread. */
  practiceStats?: PracticeSetStatsResponse | null;
  /** The notes the talebe sent to the hoca; null when the read failed, left out for none. */
  notes?: ExamQuestionNoteResponse[] | null;
}) {
  const [current, setCurrent] = useState(draft);
  useEffect(() => {
    // A newer version replaces the page's; `locked` alone moves without a
    // version (a talebe's start or a pool attempt), so it is taken from
    // every read of the same set, and "Seti sil" turns off after a refusal.
    setCurrent((now) =>
      draft.version > now.version
        ? draft
        : draft.id === now.id && draft.locked !== now.locked
          ? { ...now, locked: draft.locked }
          : now
    );
  }, [draft]);
  const view =
    current.status === "DRAFT" ? (
      <ExamEditor
        key="draft"
        courseId={courseId}
        draft={current}
        kind={current.kind}
        publish={{ timeZone, onPublished: setCurrent }}
      />
    ) : (
      <PublishedExam
        key="published"
        draft={current}
        kind={current.kind}
        timeZone={timeZone}
        locale={locale}
        practiceStats={practiceStats}
        onUnpublished={setCurrent}
      />
    );
  const notesPart =
    notes === undefined ? null : <TalebeNotesSection notes={notes} />;
  if (current.kind !== "PRACTICE")
    return (
      <>
        {view}
        {notesPart}
      </>
    );
  return (
    <>
      {view}
      {notesPart}
      <DeletePracticeSet
        courseId={courseId}
        setId={current.id}
        title={current.title}
        locked={current.locked || (practiceStats?.attemptCount ?? 0) > 0}
        placement="page"
      />
    </>
  );
}
