"use client";

import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import type { Dispatch, SetStateAction } from "react";
import {
  ZEROTH_HADITH,
  ZEROTH_OPTION_MAX,
  ZEROTH_OPTIONS_MAX,
  ZEROTH_OPTIONS_MIN,
  ZEROTH_TEXT_MAX,
  type ZerothDraft,
  type ZerothProblem,
} from "../zeroth-question";

/**
 * The zeroth question's fields (MDRS-299): the hadith, fixed, then the
 * question and its options. Shared by the medrese's form on Medrese ayarları
 * and a course's own on its Sınavlar page.
 */
export function ZerothQuestionFields({
  draft,
  setDraft,
  problem,
}: {
  draft: ZerothDraft;
  setDraft: Dispatch<SetStateAction<ZerothDraft>>;
  problem: ZerothProblem | null;
}) {
  const t = useTranslations("nazar");
  const setOption = (index: number, value: string) =>
    setDraft((d) => ({
      ...d,
      options: d.options.map((o, i) => (i === index ? value : o)),
    }));
  return (
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
  );
}
