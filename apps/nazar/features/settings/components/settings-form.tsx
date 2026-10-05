"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { dayFormat } from "~/lib/dates";
import type { Messages } from "~/lib/i18n/messages";
import { saveSettings } from "../actions";
import {
  DESCRIPTION_MAX,
  descriptionTooLong,
  formValid,
  NAME_MAX,
  NAME_MIN,
  nameProblem,
  POLICY_ICONS,
  POLICY_KEYS,
  type SettingsSnapshot,
  saveFailedKey,
  settingsPatch,
} from "../settings";

/**
 * The form of "Medrese ayarları" (nazir 04): Genel and Politikalar, and under
 * them the last change with Vazgeç and Kaydet. The policies are checkboxes,
 * not switches: they wait for Kaydet, which is what the canvas draws (a switch
 * commits the moment it changes). Kaydet is off until something differs from
 * the last save; a blank name is refused on the page, under its field, and
 * never sent. A save the API refuses leaves the form as it was and says so in
 * a toast that stays.
 */
export function SettingsForm({
  madrasahId,
  initial,
  timeZone,
}: {
  madrasahId: string;
  initial: SettingsSnapshot;
  /** the viewer's zone, for "Son değişiklik" */
  timeZone: string;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState(initial.form);
  const [attempted, setAttempted] = useState(false);

  const dirty = settingsPatch(saved.form, draft) !== null;
  const problem = attempted ? nameProblem(draft.name) : null;
  const long = attempted && descriptionTooLong(draft.description);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAttempted(true);
    if (!formValid(draft)) {
      const field = nameProblem(draft.name) ? "name" : "description";
      (
        event.currentTarget.elements.namedItem(field) as HTMLElement | null
      )?.focus();
      return;
    }
    const patch = settingsPatch(saved.form, draft);
    if (!patch || pending) return;
    startTransition(async () => {
      const result = await saveSettings(madrasahId, patch);
      if (result.success) {
        setSaved(result.data);
        setDraft(result.data.form);
        setAttempted(false);
        notify({ tone: "success", title: t("Settings.saved") });
        router.refresh();
      } else {
        notify({
          tone: "error",
          title: t("Settings.saveFailedTitle"),
          description: words(saveFailedKey(result.code)),
        });
      }
    });
  };

  const cancel = () => {
    setDraft(saved.form);
    setAttempted(false);
  };

  const day = dayFormat(locale, timeZone);
  const lastChange = saved.updatedAt
    ? saved.updatedBy
      ? t("Settings.lastChange", {
          date: day.format(new Date(saved.updatedAt)),
          name: saved.updatedBy,
        })
      : t("Settings.lastChangeAnonymous", {
          date: day.format(new Date(saved.updatedAt)),
        })
    : null;

  return (
    <form
      noValidate
      onSubmit={submit}
      className="flex min-inline-0 flex-col gap-section"
      data-testid="settings-form"
    >
      <section
        aria-labelledby="general-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="mds-h2" id="general-heading">
            {t("Settings.generalTitle")}
          </h2>
          <span className="mds-caption">* {t("Settings.required")}</span>
        </div>
        <div className="mds-card flex flex-col gap-section p-card">
          <Field
            label={t("Settings.name")}
            required
            help={t("Settings.nameHelp")}
            error={
              problem
                ? t(`Settings.nameProblems.${problem}`, {
                    min: NAME_MIN,
                    max: NAME_MAX,
                  })
                : undefined
            }
          >
            <Input
              name="name"
              required
              autoComplete="off"
              value={draft.name}
              onChange={(event) =>
                setDraft({ ...draft, name: event.target.value })
              }
            />
          </Field>
          <Field
            label={t("Settings.description")}
            help={t("Settings.descriptionHelp")}
            error={
              long
                ? t("Settings.descriptionLong", { max: DESCRIPTION_MAX })
                : undefined
            }
          >
            <Textarea
              name="description"
              rows={5}
              value={draft.description}
              onChange={(event) =>
                setDraft({ ...draft, description: event.target.value })
              }
            />
          </Field>
        </div>
      </section>

      <section
        aria-labelledby="policies-heading"
        className="flex flex-col gap-3"
      >
        <h2 className="mds-h2" id="policies-heading">
          {t("Settings.policiesTitle")}
        </h2>
        <p>{t("Settings.policiesIntro")}</p>
        <fieldset className="min-inline-0 border-0 p-0">
          <legend className="mds-visually-hidden">
            {t("Settings.policiesGroup")}
          </legend>
          <div className="mds-card flex flex-col gap-4 p-card">
            <p className="mds-label" aria-hidden="true">
              {t("Settings.policiesGroup")}
            </p>
            {POLICY_KEYS.map((key) => (
              <Checkbox
                key={key}
                bordered
                icon={<Icon name={POLICY_ICONS[key]} size="sm" />}
                label={t(`Settings.policies.${key}.label`)}
                description={t(`Settings.policies.${key}.help`)}
                checked={draft.policies[key]}
                onCheckedChange={(checked) =>
                  setDraft({
                    ...draft,
                    policies: { ...draft.policies, [key]: checked },
                  })
                }
              />
            ))}
            <p className="mds-caption">{t("Settings.policiesNote")}</p>
          </div>
        </fieldset>
      </section>

      <Alert title={t("Settings.narrowerTitle")}>
        <p>{t("Settings.narrower")}</p>
      </Alert>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <p className="mds-caption" data-testid="last-change">
          {lastChange}
        </p>
        <div className="flex items-center gap-2">
          <Button variant="ghost" disabled={!dirty || pending} onClick={cancel}>
            {t("Settings.cancel")}
          </Button>
          <Button
            type="submit"
            disabled={!dirty}
            loading={pending}
            loadingLabel={t("Settings.saving")}
          >
            {t("Settings.save")}
          </Button>
        </div>
      </div>
    </form>
  );
}
