"use client";

import type {
  OnlineExamDraftResponse,
  PracticeSetStatsResponse,
} from "@medaris/services/tedrisat";
import { useEffect, useState } from "react";
import { ExamEditor } from "./exam-editor";
import { PublishedExam } from "./exam-publish";

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
 */
export function ExamWorkspace({
  courseId,
  draft,
  timeZone,
  locale,
  practiceStats,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
  timeZone: string;
  locale: string;
  /** A çalışma seti's figures: null when nobody finished it, undefined when unread. */
  practiceStats?: PracticeSetStatsResponse | null;
}) {
  const [current, setCurrent] = useState(draft);
  useEffect(() => {
    setCurrent((now) => (draft.version > now.version ? draft : now));
  }, [draft]);
  return current.status === "DRAFT" ? (
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
}
