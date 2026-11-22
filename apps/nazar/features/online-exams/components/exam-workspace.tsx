"use client";

import type { OnlineExamDraftResponse } from "@medaris/services/tedrisat";
import { useState } from "react";
import { ExamEditor } from "./exam-editor";
import { PublishedExam } from "./exam-publish";

/**
 * One online exam's page (MDRS-299): the editor while it is a draft, the
 * published exam once it is. Publishing and taking back answer the exam as
 * it now stands, so the page turns from one to the other without reading
 * it again.
 */
export function ExamWorkspace({
  courseId,
  draft,
  timeZone,
  locale,
}: {
  courseId: string;
  draft: OnlineExamDraftResponse;
  timeZone: string;
  locale: string;
}) {
  const [current, setCurrent] = useState(draft);
  return current.status === "DRAFT" ? (
    <ExamEditor
      key={`draft-${current.version}`}
      courseId={courseId}
      draft={current}
      publish={{ timeZone, onPublished: setCurrent }}
    />
  ) : (
    <PublishedExam
      key={`published-${current.version}`}
      draft={current}
      timeZone={timeZone}
      locale={locale}
      onUnpublished={setCurrent}
    />
  );
}
