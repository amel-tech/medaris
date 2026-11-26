"use client";

import { Button } from "@medaris/ui/mds/button";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { dayFormat } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { saveZerothQuestion } from "../actions";
import { saveFailedKey } from "../settings";
import {
  formOf,
  type ZerothSaved,
  zerothBody,
  zerothDirty,
  zerothProblem,
} from "../zeroth-question";
import { ZerothQuestionFields } from "./zeroth-question-fields";

/**
 * "Sınavların sıfırıncı sorusu" on Medrese ayarları (MDRS-299): the hadith,
 * fixed, then the medrese's question and its options. The owner, 22 Nov 2026:
 * one question for every exam of the medrese's courses, changed when the
 * medrese changes it. A save does not wait on the page: the fields stay open,
 * only Kaydet shows that it runs, and the answer becomes the last save with
 * no page read. A save that fails keeps what was typed.
 */
export function ZerothQuestionForm({
  madrasahId,
  initial,
  timeZone,
}: {
  madrasahId: string;
  initial: ZerothSaved;
  timeZone: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const { notify } = useToaster();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(() => formOf(initial));
  const [attempted, setAttempted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const problem = attempted ? zerothProblem(draft) : null;
  const dirty = zerothDirty(saved, draft);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (zerothProblem(draft) || !dirty || saving) return;
    setSaving(true);
    setFailed(false);
    const result = await saveZerothQuestion(madrasahId, zerothBody(draft));
    setSaving(false);
    if (handleUnauthenticated(result)) return;
    if (result.success) {
      setSaved(result.data);
      setAttempted(false);
      notify({ tone: "success", title: t("Settings.zeroth.saved") });
      return;
    }
    setFailed(true);
    notify({
      tone: "error",
      title: t("Settings.zeroth.saveFailedTitle"),
      description: words(saveFailedKey(result.code)),
    });
  };

  const day = dayFormat(locale, timeZone);
  const status = saving
    ? t("Settings.zeroth.saving")
    : failed
      ? t("Settings.zeroth.notSaved")
      : saved.updatedAt
        ? t("Settings.zeroth.savedAt", {
            date: day.format(new Date(saved.updatedAt)),
          })
        : t("Settings.zeroth.none");

  return (
    <form
      noValidate
      onSubmit={submit}
      aria-labelledby="zeroth-heading"
      className="flex min-inline-0 flex-col gap-3"
      data-testid="zeroth-form"
    >
      <h2 className="mds-h2" id="zeroth-heading">
        {t("Settings.zeroth.title")}
      </h2>
      <p>{t("Settings.zeroth.intro")}</p>
      <ZerothQuestionFields
        draft={draft}
        setDraft={setDraft}
        problem={problem}
      />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <p
          className="mds-caption"
          aria-live="polite"
          data-testid="zeroth-status"
        >
          {status}
        </p>
        <Button
          type="submit"
          disabled={!dirty}
          loading={saving}
          loadingLabel={t("Settings.zeroth.saving")}
        >
          {t("Settings.zeroth.save")}
        </Button>
      </div>
    </form>
  );
}
