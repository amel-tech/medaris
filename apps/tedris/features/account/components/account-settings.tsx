"use client";

import { AppProviders } from "@medaris/ui/mds/app-providers";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Switch } from "@medaris/ui/mds/switch";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { useAccountTranslations } from "~/lib/i18n/loose";
import { CARD_GAP } from "../card-gap";
import {
  updateMyInvitationEmails,
  updateMyName,
  updateMyTimeZone,
} from "../profile-actions";
import {
  allTimeZones,
  type NameErrors,
  OTHER_ZONE,
  TIME_ZONE_PRESETS,
  validateName,
  zoneChoice,
} from "../profile-model";

export interface AccountSettingsProps {
  givenName: string;
  familyName: string;
  email: string;
  timeZone: string | null;
  /** Lesson invitations by e-mail (MDRS-121); on unless turned off. */
  lessonInvitationEmails: boolean;
}

function PersonalCard({
  givenName: savedGiven,
  familyName: savedFamily,
  email,
}: Pick<AccountSettingsProps, "givenName" | "familyName" | "email">) {
  const t = useAccountTranslations("AccountProfile");
  const toaster = useToaster();
  const [givenName, setGivenName] = useState(savedGiven);
  const [familyName, setFamilyName] = useState(savedFamily);
  const [errors, setErrors] = useState<NameErrors>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateName(givenName, familyName);
    setErrors(found);
    // A blank name never reaches the API (criterion 2).
    if (found.givenName || found.familyName) return;
    startTransition(async () => {
      const res = await updateMyName(givenName.trim(), familyName.trim());
      if (res.success === true) {
        setGivenName(res.data.givenName ?? givenName.trim());
        setFamilyName(res.data.familyName ?? familyName.trim());
        toaster.notify({ tone: "success", title: t("nameSaved") });
      } else {
        toaster.notify({
          tone: "error",
          title: t("nameFailed"),
          description: t("errorHint"),
        });
      }
    });
  };

  return (
    <Card title={t("personalTitle")} headingLevel={2} className={CARD_GAP}>
      <form className="flex flex-col gap-5" onSubmit={submit} noValidate>
        <p className="mds-caption">{t("requiredNote")}</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t("givenName")}
            required
            error={errors.givenName ? t("givenNameRequired") : undefined}
          >
            <Input
              name="givenName"
              autoComplete="given-name"
              required
              value={givenName}
              onChange={(e) => setGivenName(e.target.value)}
            />
          </Field>
          <Field
            label={t("familyName")}
            required
            error={errors.familyName ? t("familyNameRequired") : undefined}
          >
            <Input
              name="familyName"
              autoComplete="family-name"
              required
              value={familyName}
              onChange={(e) => setFamilyName(e.target.value)}
            />
          </Field>
        </div>
        <p className="mds-help">{t("nameHelp")}</p>
        <Field label={t("email")} help={t("emailHelp")}>
          <Input
            name="email"
            type="email"
            mono
            readOnly
            value={email}
            leading={<Icon name="lock" size="sm" />}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={pending} loadingLabel={t("saving")}>
            {t("save")}
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TimeLanguageCard({
  timeZone,
}: Pick<AccountSettingsProps, "timeZone">) {
  const t = useAccountTranslations("AccountProfile");
  const toaster = useToaster();
  const [saved, setSaved] = useState(timeZone ?? "Europe/Istanbul");
  // What the select shows: a preset, or "Diğer…" while a zone outside them is in use.
  const [choice, setChoice] = useState(zoneChoice(timeZone));
  const [pending, startTransition] = useTransition();

  const options = [
    ...TIME_ZONE_PRESETS.map((p) => ({
      value: p.zone,
      label: t(`zones.${p.id}`),
    })),
    { value: OTHER_ZONE, label: t("zones.other") },
  ];
  const everyZone = allTimeZones().map((zone) => ({
    value: zone,
    label: zone.replaceAll("_", " "),
  }));

  const save = (zone: string, previousChoice: string) => {
    const previous = saved;
    setSaved(zone);
    startTransition(async () => {
      const res = await updateMyTimeZone(zone);
      if (res.success === true) {
        toaster.notify({ tone: "success", title: t("zoneSaved") });
        return;
      }
      // The save failed: the select goes back to what is stored.
      setSaved(previous);
      setChoice(previousChoice);
      toaster.notify({
        tone: "error",
        title: t("zoneFailed"),
        description: t("errorHint"),
      });
    });
  };

  const pick = (value: string | null) => {
    if (!value || value === choice) return;
    const previousChoice = choice;
    setChoice(value);
    // "Diğer…" only opens the full list; the zone is saved when one is picked there.
    if (value !== OTHER_ZONE) save(value, previousChoice);
  };

  return (
    <Card title={t("timeTitle")} headingLevel={2} className={CARD_GAP}>
      <div className="flex flex-col gap-5" aria-busy={pending}>
        <Field label={t("timeZone")} help={t("timeZoneHelp")}>
          <Select
            id="account-time-zone"
            aria-label={t("timeZone")}
            options={options}
            value={choice}
            onChange={pick}
          />
        </Field>
        {choice === OTHER_ZONE ? (
          <Field label={t("otherZone")} help={t("otherZoneHelp")}>
            <Select
              id="account-time-zone-other"
              aria-label={t("otherZone")}
              options={everyZone}
              placeholder={t("otherZonePlaceholder")}
              value={zoneChoice(saved) === OTHER_ZONE && saved ? saved : null}
              onChange={(zone) => {
                if (zone) save(zone, OTHER_ZONE);
              }}
            />
          </Field>
        ) : null}
        <Field label={t("language")} help={t("languageHelp")}>
          <Input name="language" readOnly value={t("languageValue")} />
        </Field>
      </div>
    </Card>
  );
}

/**
 * The calendar card: the feed (MDRS-120) and, below it, the switch for
 * lesson invitations by e-mail (MDRS-121). No design draws the switch; it
 * follows the switches of the public-profile page, saved the moment it
 * changes and put back if the save fails.
 */
function CalendarCard({
  lessonInvitationEmails,
}: Pick<AccountSettingsProps, "lessonInvitationEmails">) {
  const t = useAccountTranslations("AccountProfile");
  const locale = useLocale();
  const toaster = useToaster();
  const [invitations, setInvitations] = useState(lessonInvitationEmails);
  const [saving, setSaving] = useState(false);

  const toggle = (on: boolean) => {
    const before = invitations;
    setInvitations(on);
    setSaving(true);
    void updateMyInvitationEmails(on)
      .then((res) => {
        if (res.success === true) {
          toaster.notify({
            tone: "success",
            title: t(on ? "invitationsOn" : "invitationsOff"),
          });
          return;
        }
        setInvitations(before);
        toaster.notify({
          tone: "error",
          title: t("invitationsFailed"),
          description: t("errorHint"),
        });
      })
      .finally(() => setSaving(false));
  };

  return (
    <Card title={t("calendarTitle")} headingLevel={2} className={CARD_GAP}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-inline-0 flex-1 items-start gap-3">
            <Icon name="calendar" className="mbs-1 text-neutral-muted" />
            <div className="flex flex-col gap-1">
              <p className="mds-body-sm font-medium">{t("calendarName")}</p>
              <p className="mds-caption">{t("calendarText")}</p>
            </div>
          </div>
          <Button variant="outline" href={`/${locale}/account/calendar`}>
            {t("calendarManage")}
          </Button>
        </div>
        <Switch
          label={t("invitationsLabel")}
          description={t("invitationsHelp")}
          checked={invitations}
          disabled={saving}
          onCheckedChange={toggle}
        />
      </div>
    </Card>
  );
}

function PublicProfileCard() {
  const t = useAccountTranslations("AccountProfile");
  const locale = useLocale();
  return (
    <Card title={t("publicTitle")} headingLevel={2} className={CARD_GAP}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="mds-caption min-inline-0 flex-1">{t("publicText")}</p>
        <Button variant="outline" href={`/${locale}/account/public-profile`}>
          {t("publicManage")}
        </Button>
      </div>
    </Card>
  );
}

function SignOutCard() {
  const t = useAccountTranslations("AccountProfile");
  const locale = useLocale();
  return (
    <Card>
      <div className="flex flex-col items-start gap-4">
        <h2 className="mds-visually-hidden">{t("signOutTitle")}</h2>
        <p className="mds-body-sm">{t("signOutText")}</p>
        <Button
          variant="secondary"
          href={`/${locale}/auth/signout`}
          iconLeft={<Icon name="signOut" />}
        >
          {t("signOut")}
        </Button>
      </div>
    </Card>
  );
}

/**
 * The cards of Hesap (design tedris/34, MDRS-166): personal information, time
 * zone and language, calendar, and the sign-out aside, plus a way to the public
 * profile (design tedris/35). The roles section (design 43) follows below it on
 * the page. A client component so the Toast root and the form state share one
 * tree.
 */
export function AccountSettings(props: AccountSettingsProps) {
  return (
    <AppProviders>
      <div className="grid items-start gap-section lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="flex min-inline-0 flex-col gap-section">
          <PersonalCard {...props} />
          <TimeLanguageCard timeZone={props.timeZone} />
          <CalendarCard lessonInvitationEmails={props.lessonInvitationEmails} />
          <PublicProfileCard />
        </div>
        <SignOutCard />
      </div>
    </AppProviders>
  );
}
