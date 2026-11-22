"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
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
  ZEROTH_HADITH,
  ZEROTH_OPTION_MAX,
  ZEROTH_OPTIONS_MAX,
  ZEROTH_OPTIONS_MIN,
  ZEROTH_TEXT_MAX,
  type ZerothSaved,
  zerothBody,
  zerothDirty,
  zerothProblem,
} from "../zeroth-question";

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

  const setOption = (index: number, value: string) =>
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => (i === index ? value : o)),
    }));

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
      <div className="mds-card flex flex-col gap-section p-card">
        <figure className="flex flex-col gap-1">
          <p className="mds-arabic-text" lang="ar" dir="rtl">
            {ZEROTH_HADITH}
          </p>
          <figcaption className="mds-caption">
            {t("Settings.zeroth.hadithMeaning")}
          </figcaption>
        </figure>
        <Field
          label={t("Settings.zeroth.question")}
          required
          help={t("Settings.zeroth.questionHelp")}
          error={
            problem === "text" || problem === "textLong"
              ? t(`Settings.zeroth.problems.${problem}`, {
                  max: ZEROTH_TEXT_MAX,
                })
              : undefined
          }
        >
          <Textarea
            name="zerothText"
            rows={3}
            dir="auto"
            value={draft.text}
            onChange={(event) =>
              setDraft((d) => ({ ...d, text: event.target.value }))
            }
          />
        </Field>
        <fieldset className="flex min-inline-0 flex-col gap-2 border-0 p-0">
          <legend className="mds-label">{t("Settings.zeroth.options")}</legend>
          <p className="mds-caption">
            {t("Settings.zeroth.optionsHelp", {
              min: ZEROTH_OPTIONS_MIN,
              max: ZEROTH_OPTIONS_MAX,
            })}
          </p>
          <ol className="flex flex-col gap-2">
            {draft.options.map((option, index) => (
              // the fields are positions: one is typed into, added or taken off
              <li key={index} className="flex items-center gap-2">
                <Input
                  aria-label={t("Settings.zeroth.option", {
                    number: index + 1,
                  })}
                  dir="auto"
                  maxLength={ZEROTH_OPTION_MAX}
                  value={option}
                  onChange={(event) => setOption(index, event.target.value)}
                />
                {draft.options.length > ZEROTH_OPTIONS_MIN ? (
                  <IconButton
                    size="small"
                    icon={<Icon name="trash" size="sm" />}
                    label={t("Settings.zeroth.removeOption", {
                      number: index + 1,
                    })}
                    onClick={() =>
                      setDraft((d) => ({
                        ...d,
                        options: d.options.filter((_, i) => i !== index),
                      }))
                    }
                  />
                ) : null}
              </li>
            ))}
          </ol>
          {problem === "options" ||
          problem === "optionLong" ||
          problem === "same" ? (
            <p className="mds-error" role="alert">
              {t(`Settings.zeroth.problems.${problem}`, {
                min: ZEROTH_OPTIONS_MIN,
                max: ZEROTH_OPTION_MAX,
              })}
            </p>
          ) : null}
          {draft.options.length < ZEROTH_OPTIONS_MAX ? (
            <Button
              variant="outline"
              size="small"
              className="self-start"
              iconLeft={<Icon name="plus" size="sm" />}
              onClick={() =>
                setDraft((d) => ({ ...d, options: [...d.options, ""] }))
              }
            >
              {t("Settings.zeroth.addOption")}
            </Button>
          ) : null}
        </fieldset>
      </div>
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
