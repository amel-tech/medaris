"use client";

import type { CourseZerothQuestionResponse } from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { ZerothQuestionFields } from "~/features/settings/components/zeroth-question-fields";
import {
  formOf,
  type ZerothDraft,
  zerothBody,
  zerothProblem,
} from "~/features/settings/zeroth-question";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import {
  removeCourseZerothQuestion,
  saveCourseZerothQuestion,
} from "../actions";
import { onlineExamErrorKey } from "../online-exams";

/**
 * "Sıfırıncı soru" on a course's Sınavlar page (MDRS-299). The owner, 22 Nov
 * 2026: "ders özelinde sıfırıncı soru mümkün olsun, medreseninki default
 * olur ders özelinde değişebilir". It shows the question the course's exams
 * ask, its own or its medrese's, and lets the team write one for the course or
 * go back to the medrese's. A save keeps the fields open and shows that it
 * runs; one that fails keeps what was typed. Going back shows at once and is
 * put back if it is refused.
 */
export function CourseZerothSection({
  courseId,
  initial,
}: {
  courseId: string;
  initial: CourseZerothQuestionResponse;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [zeroth, setZeroth] = useState(initial);
  const [draft, setDraft] = useState<ZerothDraft | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [asking, setAsking] = useState(false);

  const applied = zeroth.own ?? zeroth.madrasah;
  const problem = draft && attempted ? zerothProblem(draft) : null;

  const refused = (title: string, code: string) =>
    notify({
      tone: "error",
      title,
      description: words(onlineExamErrorKey(code)),
    });

  /** Opens the form on the course's own question, else on the medrese's to change. */
  const open = () => {
    const from = zeroth.own ?? zeroth.madrasah;
    setDraft(
      formOf({
        text: from?.text ?? "",
        options: from?.options ?? [],
        updatedAt: null,
      })
    );
    setAttempted(false);
    setFailed(false);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || saving) return;
    setAttempted(true);
    if (zerothProblem(draft)) return;
    setSaving(true);
    setFailed(false);
    const result = await saveCourseZerothQuestion(courseId, zerothBody(draft));
    setSaving(false);
    if (handleUnauthenticated(result)) return;
    if (result.success) {
      setZeroth(result.data);
      setDraft(null);
      notify({ tone: "success", title: t("OnlineExams.zeroth.saved") });
      return;
    }
    setFailed(true);
    refused(t("OnlineExams.zeroth.saveFailed"), result.code);
  };

  const remove = async () => {
    setAsking(false);
    const before = zeroth;
    setZeroth({
      ...zeroth,
      own: null,
      applies: zeroth.madrasah ? "MADRASAH" : "NONE",
    });
    const result = await removeCourseZerothQuestion(courseId);
    if (handleUnauthenticated(result)) return;
    if (result.success) {
      setZeroth(result.data);
      return;
    }
    setZeroth(before);
    refused(t("OnlineExams.zeroth.removeFailed"), result.code);
  };

  return (
    <section
      aria-labelledby="course-zeroth-heading"
      className="flex max-inline-measure flex-col gap-3"
      data-testid="course-zeroth"
    >
      <h2 className="mds-h2" id="course-zeroth-heading">
        {t("OnlineExams.zeroth.title")}
      </h2>
      <p className="mds-body-sm text-neutral-muted">
        {t("OnlineExams.zeroth.intro")}
      </p>
      {draft ? (
        <form
          noValidate
          onSubmit={submit}
          aria-label={t("OnlineExams.zeroth.formLabel")}
          className="flex flex-col gap-3"
        >
          <ZerothQuestionFields
            draft={draft}
            setDraft={(update) =>
              setDraft((d) =>
                d === null
                  ? d
                  : typeof update === "function"
                    ? update(d)
                    : update
              )
            }
            problem={problem}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="submit"
              loading={saving}
              loadingLabel={t("OnlineExams.zeroth.saving")}
            >
              {t("OnlineExams.zeroth.save")}
            </Button>
            <Button
              variant="ghost"
              disabled={saving}
              onClick={() => setDraft(null)}
            >
              {t("OnlineExams.zeroth.cancel")}
            </Button>
            {failed ? (
              <p className="mds-caption" aria-live="polite">
                {t("OnlineExams.zeroth.notSaved")}
              </p>
            ) : null}
          </div>
        </form>
      ) : (
        <>
          {applied ? (
            <div className="mds-card flex flex-col gap-2 p-card">
              <div>
                <Badge variant={zeroth.own ? "brand" : "outline"}>
                  {zeroth.own
                    ? t("OnlineExams.zeroth.own")
                    : t("OnlineExams.zeroth.fromMadrasah")}
                </Badge>
              </div>
              <p className="mds-body" dir="auto">
                {applied.text}
              </p>
              <ol className="mds-body-sm flex flex-col gap-1" type="A">
                {applied.options.map((option, i) => (
                  // the options are positions of a question saved whole
                  <li key={i} dir="auto">
                    {option}
                  </li>
                ))}
              </ol>
            </div>
          ) : (
            <p className="mds-body-sm" role="note">
              {t("OnlineExams.zeroth.none")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={open}>
              {zeroth.own
                ? t("OnlineExams.zeroth.edit")
                : applied
                  ? t("OnlineExams.zeroth.change")
                  : t("OnlineExams.zeroth.write")}
            </Button>
            {zeroth.own ? (
              <Button variant="ghost" onClick={() => setAsking(true)}>
                {zeroth.inMadrasah
                  ? t("OnlineExams.zeroth.backToMadrasah")
                  : t("OnlineExams.zeroth.remove")}
              </Button>
            ) : null}
          </div>
          {/* Opened by state, as the other nazar dialogs are. */}
          <AlertDialog
            open={asking}
            onOpenChange={setAsking}
            title={t("OnlineExams.zeroth.removeTitle")}
            confirmLabel={
              zeroth.inMadrasah
                ? t("OnlineExams.zeroth.backToMadrasah")
                : t("OnlineExams.zeroth.remove")
            }
            cancelLabel={t("OnlineExams.zeroth.cancel")}
            closeLabel={t("Shell.close")}
            onConfirm={remove}
          >
            {zeroth.madrasah
              ? t("OnlineExams.zeroth.removeBody")
              : t("OnlineExams.zeroth.removeBodyNone")}
          </AlertDialog>
        </>
      )}
    </section>
  );
}
