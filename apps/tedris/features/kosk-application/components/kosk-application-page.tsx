"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { AppProviders } from "@medaris/ui/mds/app-providers";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { CARD_GAP } from "~/features/account/card-gap";
import { useAccountTranslations } from "~/lib/i18n/loose";
import { submitKoskApplication } from "../actions";
import {
  APPLICATION_FIELDS,
  type ApplicationDraft,
  type ApplicationErrors,
  hasErrors,
  validateApplication,
} from "../model";

function Content({
  email,
  privacyNoticeHref,
}: {
  email: string;
  privacyNoticeHref: string;
}) {
  const t = useAccountTranslations("KoskApplication");
  const locale = useLocale();
  const toaster = useToaster();
  const [draft, setDraft] = useState<ApplicationDraft>({
    name: "",
    field: "",
    summary: "",
    reason: "",
    email,
    phone: "",
  });
  const [errors, setErrors] = useState<ApplicationErrors>({});
  const [sent, setSent] = useState(false);
  const [pending, startTransition] = useTransition();

  const set = (key: keyof ApplicationDraft, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setErrors((e) => {
      if (!e[key]) return e;
      const { [key]: _gone, ...rest } = e;
      return rest;
    });
  };
  const errorText = (key: keyof ApplicationDraft) => {
    const kind = errors[key];
    if (!kind) return undefined;
    return kind === "required" ? t(`errors.${key}`) : t(`errors.${kind}`);
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateApplication(draft);
    setErrors(found);
    // An incomplete form never reaches the API (criterion 1).
    if (hasErrors(found)) return;
    startTransition(async () => {
      const res = await submitKoskApplication(draft);
      if (res.success === true) {
        setSent(true);
      } else {
        toaster.notify({
          tone: "error",
          title: t("submitFailed"),
          description: t("errorHint"),
        });
      }
    });
  };

  const discover = `/${locale}/discover`;

  if (sent) {
    return (
      <Card title={t("sentTitle")} headingLevel={2} className={CARD_GAP}>
        <div
          className="flex flex-col items-start gap-4"
          data-testid="application-sent"
        >
          <Alert tone="success">{t("sentText")}</Alert>
          <Button variant="outline" href={discover}>
            {t("backToDiscover")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="grid items-start gap-section lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form
        className="flex min-inline-0 flex-col gap-section"
        onSubmit={submit}
        noValidate
      >
        <Card title={t("koskTitle")} headingLevel={2} className={CARD_GAP}>
          <div className="flex flex-col gap-5">
            <p className="mds-caption">{t("requiredNote")}</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("name")}
                required
                help={t("nameHelp")}
                error={errorText("name")}
              >
                <Input
                  name="name"
                  maxLength={120}
                  required
                  value={draft.name}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field
                label={t("field")}
                required
                help={t("fieldHelp")}
                error={errorText("field")}
              >
                <Select
                  id="application-field"
                  aria-label={t("field")}
                  placeholder={t("fieldPlaceholder")}
                  options={APPLICATION_FIELDS.map((f) => ({
                    value: f.value,
                    label: t(`fields.${f.key}`),
                  }))}
                  value={draft.field || null}
                  onChange={(v) => set("field", v ?? "")}
                  required
                />
              </Field>
            </div>
            <Field
              label={t("summary")}
              required
              help={t("summaryHelp")}
              error={errorText("summary")}
            >
              <Textarea
                name="summary"
                rows={4}
                maxLength={500}
                required
                value={draft.summary}
                onChange={(e) => set("summary", e.target.value)}
              />
            </Field>
            <Field
              label={t("reason")}
              required
              help={t("reasonHelp")}
              error={errorText("reason")}
            >
              <Textarea
                name="reason"
                rows={6}
                maxLength={3000}
                required
                value={draft.reason}
                onChange={(e) => set("reason", e.target.value)}
              />
            </Field>
          </div>
        </Card>

        <Card title={t("contactTitle")} headingLevel={2} className={CARD_GAP}>
          <div className="flex flex-col gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t("email")}
                required
                help={t("emailHelp")}
                error={errorText("email")}
              >
                <Input
                  name="email"
                  type="email"
                  mono
                  autoComplete="email"
                  maxLength={254}
                  required
                  value={draft.email}
                  onChange={(e) => set("email", e.target.value)}
                />
              </Field>
              <Field
                label={t("phone")}
                help={t("phoneHelp")}
                error={errorText("phone")}
              >
                <Input
                  name="phone"
                  type="tel"
                  mono
                  autoComplete="tel"
                  placeholder="+90 5__ ___ __ __"
                  value={draft.phone}
                  onChange={(e) => set("phone", e.target.value)}
                />
              </Field>
            </div>
            <p className="mds-caption">
              {t("noticeBefore")}
              <a
                className="underline"
                href={privacyNoticeHref}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t("noticeLink")}
              </a>
              {t("noticeAfter")}
            </p>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="ghost" href={discover}>
            {t("cancel")}
          </Button>
          <Button type="submit" loading={pending} loadingLabel={t("sending")}>
            {t("submit")}
          </Button>
        </div>
      </form>

      <aside className="mds-card flex flex-col gap-4 p-card">
        <h2 className="mds-h3">{t("afterTitle")}</h2>
        <ol className="flex flex-col">
          {(["step1", "step2", "step3"] as const).map((step, i) => (
            <li
              key={step}
              className="flex items-start gap-3 pbs-3 pbe-3 [&:not(:first-child)]:border-bs border-neutral-subtle"
            >
              <span className="mds-body-sm font-medium">{i + 1}</span>
              <p className="mds-body-sm">{t(step)}</p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}

/**
 * Köşk açma başvurusu (design tedris/37, MDRS-166): the form and the "Başvurundan
 * sonra" aside. The e-mail starts as the account's address and can be changed.
 * Nothing is saved until "Başvuruyu gönder"; "Vazgeç" only goes back.
 */
export function KoskApplicationPage({
  email,
  privacyNoticeHref,
}: {
  email: string;
  privacyNoticeHref: string;
}) {
  return (
    <AppProviders>
      <Content email={email} privacyNoticeHref={privacyNoticeHref} />
    </AppProviders>
  );
}
