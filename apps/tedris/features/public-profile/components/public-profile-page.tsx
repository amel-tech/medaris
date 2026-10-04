"use client";

import type { MyPublicProfileResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Switch } from "@medaris/ui/mds/switch";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { LocaleAppProviders } from "~/components/locale-app-providers";
import { CARD_GAP } from "~/features/account/card-gap";
import { useAccountTranslations } from "~/lib/i18n/loose";
import { saveProfileTexts, saveVisibility } from "../actions";
import {
  type Gender,
  type HideableField,
  hiddenLine,
  isDirty,
  type ProfileDraft,
  type ProfileErrors,
  type Visibility,
  validateProfile,
} from "../model";

export interface PublicProfilePageProps {
  profile: MyPublicProfileResponse;
}

const draftOf = (p: MyPublicProfileResponse): ProfileDraft => ({
  kunye: p.kunye ?? "",
  gender: (p.gender as Gender | null) ?? null,
  city: p.city ?? "",
  about: p.about ?? "",
});

function Content({ profile }: PublicProfilePageProps) {
  const t = useAccountTranslations("PublicProfile");
  const locale = useLocale();
  const toaster = useToaster();
  const [saved, setSaved] = useState(() => draftOf(profile));
  const [draft, setDraft] = useState(saved);
  const [visibility, setVisibility] = useState<Visibility>(profile.visibility);
  const [errors, setErrors] = useState<ProfileErrors>({});
  const [kunyeTaken, setKunyeTaken] = useState(false);
  const [pending, startTransition] = useTransition();
  // A visibility PATCH is in flight: every switch waits for it.
  const [switching, setSwitching] = useState(false);

  const set = <K extends keyof ProfileDraft>(
    key: K,
    value: ProfileDraft[K]
  ) => {
    setDraft((d) => ({ ...d, [key]: value }));
    if (key === "kunye") {
      setErrors({});
      setKunyeTaken(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateProfile(draft.kunye);
    setErrors(found);
    // A blank künye never reaches the API (criterion 5).
    if (found.kunye) return;
    startTransition(async () => {
      const res = await saveProfileTexts(draft);
      if (res.success === true) {
        const next = draftOf(res.data);
        setSaved(next);
        setDraft(next);
        toaster.notify({ tone: "success", title: t("saved") });
      } else if (res.status === 409) {
        setKunyeTaken(true);
      } else {
        toaster.notify({
          tone: "error",
          title: t("saveFailed"),
          description: t("errorHint"),
        });
      }
    });
  };

  const discard = () => {
    setDraft(saved);
    setErrors({});
    setKunyeTaken(false);
  };

  const toggle = (field: HideableField, on: boolean) => {
    // One switch saves at a time. A second flip while the first is in flight
    // would let a refusal of the first roll the whole object back over the
    // second, and the preview would stop matching what is stored.
    if (switching) return;
    const before = visibility;
    // Optimistic: the preview follows at once and a refusal rolls it back.
    setVisibility({ ...before, [field]: on });
    setSwitching(true);
    void saveVisibility({ [field]: on })
      .then((res) => {
        if (res.success === true) return;
        setVisibility(before);
        toaster.notify({
          tone: "error",
          title: t("switchFailed"),
          description: t("errorHint"),
        });
      })
      .finally(() => setSwitching(false));
  };

  const switchFor = (field: HideableField) => (
    <Switch
      label={t("showToEveryone")}
      checked={visibility[field]}
      disabled={switching}
      onCheckedChange={(on) => toggle(field, on)}
      className="shrink-0"
    />
  );

  const hidden = hiddenLine(visibility, (f) => t(`hidden.${f}`));
  const previewName = draft.kunye.trim();
  const dirty = isDirty(draft, saved);

  return (
    <div className="grid items-start gap-section lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <form
        className="flex min-inline-0 flex-col gap-section"
        onSubmit={submit}
        noValidate
      >
        <Card
          title={t("identityTitle")}
          headingLevel={2}
          className={CARD_GAP}
          action={<Badge variant="outline">{t("alwaysPublic")}</Badge>}
        >
          <div className="flex flex-col gap-5">
            <p className="mds-caption">{t("requiredNote")}</p>
            <Field
              label={t("kunye")}
              required
              help={t("kunyeHelp")}
              error={
                errors.kunye
                  ? t("kunyeRequired")
                  : kunyeTaken
                    ? t("kunyeTaken")
                    : undefined
              }
            >
              <Input
                name="kunye"
                maxLength={60}
                required
                value={draft.kunye}
                onChange={(e) => set("kunye", e.target.value)}
              />
            </Field>
            <RadioGroup
              className="flex flex-row flex-wrap items-center gap-x-6 gap-y-2 [&>.mds-label]:basis-full"
              legend={t("gender")}
              name="gender"
              value={draft.gender}
              onChange={(v) => set("gender", v as Gender)}
              options={[
                { value: "FEMALE", label: t("female") },
                { value: "MALE", label: t("male") },
              ]}
            />
            <Alert tone="neutral">
              {t("consentBefore")}
              <span className="underline">{t("consentName")}</span>
              {t("consentAfter")}
            </Alert>
          </div>
        </Card>

        <Card
          title={t("otherTitle")}
          headingLevel={2}
          className={CARD_GAP}
          action={
            <Badge variant="ghost" icon={<Icon name="eyeOff" size="sm" />}>
              {t("hiddenByDefault")}
            </Badge>
          }
        >
          <div className="flex flex-col gap-4">
            <p className="mds-body-sm">{t("otherIntro")}</p>

            <section className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-4">
                <h3 className="mds-label">{t("fullName")}</h3>
                {switchFor("fullName")}
              </div>
              <p className="mds-body-sm" data-testid="profile-full-name">
                {profile.fullName ?? ""}
              </p>
              <p className="mds-help">
                <a className="underline" href={`/${locale}/account`}>
                  {t("accountLink")}
                </a>
                {t("fullNameHelp")}
              </p>
            </section>

            <hr className="mds-separator" />

            <section className="flex items-start justify-between gap-4">
              <Field label={t("city")} className="min-inline-0 flex-1">
                <Input
                  name="city"
                  maxLength={80}
                  value={draft.city}
                  onChange={(e) => set("city", e.target.value)}
                />
              </Field>
              {switchFor("city")}
            </section>

            <hr className="mds-separator" />

            <section className="flex items-start justify-between gap-4">
              <Field
                label={t("about")}
                help={t("aboutHelp")}
                className="min-inline-0 flex-1"
              >
                <Textarea
                  name="about"
                  rows={4}
                  maxLength={1000}
                  value={draft.about}
                  onChange={(e) => set("about", e.target.value)}
                />
              </Field>
              {switchFor("about")}
            </section>

            <hr className="mds-separator" />

            <section className="flex flex-col gap-1">
              <div className="flex items-start justify-between gap-4">
                <h3 className="mds-label">{t("courses")}</h3>
                {switchFor("courses")}
              </div>
              <p className="mds-body-sm" data-testid="profile-courses">
                {profile.courses.length > 0
                  ? profile.courses.join(" · ")
                  : t("noCourses")}
              </p>
              <p className="mds-help">
                {t("coursesHelpBefore")}
                <a className="underline" href={`/${locale}/my-courses`}>
                  {t("myCoursesLink")}
                </a>
                {t("coursesHelpAfter")}
              </p>
            </section>
          </div>
        </Card>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={discard}
            disabled={pending || !dirty}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" loading={pending} loadingLabel={t("saving")}>
            {t("save")}
          </Button>
        </div>
      </form>

      <aside
        className="mds-card flex flex-col gap-4 p-card"
        aria-label={t("previewTitle")}
      >
        <h2 className="mds-eyebrow">{t("previewTitle")}</h2>
        <div className="flex items-center gap-3">
          <Avatar name={previewName || "?"} size="lg" decorative />
          <div className="flex min-inline-0 flex-col">
            <p className="mds-h3" data-testid="preview-name" dir="auto">
              {previewName || t("previewNoKunye")}
            </p>
            {draft.gender ? (
              <p className="mds-caption">
                {draft.gender === "FEMALE" ? t("female") : t("male")}
              </p>
            ) : null}
          </div>
        </div>
        {visibility.fullName && profile.fullName ? (
          <p className="mds-body-sm">{profile.fullName}</p>
        ) : null}
        {visibility.city && draft.city.trim() ? (
          <p className="mds-body-sm">{draft.city.trim()}</p>
        ) : null}
        {visibility.about && draft.about.trim() ? (
          <div className="flex flex-col gap-1">
            <h3 className="mds-label">{t("about")}</h3>
            <p className="mds-body-sm whitespace-pre-line">
              {draft.about.trim()}
            </p>
          </div>
        ) : null}
        {visibility.courses && profile.courses.length > 0 ? (
          <div className="flex flex-col gap-1">
            <h3 className="mds-label">{t("courses")}</h3>
            <p className="mds-body-sm">{profile.courses.join(" · ")}</p>
          </div>
        ) : null}
        {hidden ? (
          <p
            className="mds-caption border-bs border-neutral-subtle pbs-3"
            data-testid="preview-hidden"
          >
            <Icon
              name="eyeOff"
              size="sm"
              className="mie-1 inline-block align-text-bottom"
            />
            {t("hiddenLine", { fields: hidden })}
          </p>
        ) : null}
      </aside>
    </div>
  );
}

/**
 * Herkese açık profil (design tedris/35, MDRS-166): the always-public künye and
 * gender, the four switchable fields, and the "Başkaları böyle görür" preview
 * drawn live from the form. A switch saves on its own, optimistically; the
 * texts save with "Kaydet".
 */
export function PublicProfilePage(props: PublicProfilePageProps) {
  return (
    <LocaleAppProviders>
      <Content {...props} />
    </LocaleAppProviders>
  );
}
