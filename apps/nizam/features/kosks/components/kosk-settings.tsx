"use client";

import type { KoskLevel, KoskResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Select } from "@medaris/ui/mds/select";
import { Tabs } from "@medaris/ui/mds/tabs";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import { updateKosk } from "../actions";
import {
  COVER_TONES,
  FORM_LEVELS,
  fieldOptions,
  handleLabel,
  isDirty,
  koskCase,
  koskErrorKey,
  type SettingsForm,
  settingsErrors,
  settingsFromKosk,
  settingsPayload,
} from "../admin-present";
import { KOSK_FORM_LIMITS } from "../kosk-form";
import { HideKoskDialog } from "./hide-kosk-dialog";

interface Props {
  kosk: KoskResponse;
  /** the tabs' numbers; left out when they could not be read */
  nazimCount?: number;
  hostingCount?: number;
}

/**
 * Köşk ayarları, Genel (nizam 24): the köşk's own details (the short name is
 * read-only — the Medaris yönetimi changes it), its visibility, the two
 * köşk-wide policies and, apart, "Köşkü gizle". "Kaydet" sends only what
 * changed and does nothing while a field is wrong; "Vazgeç" puts the köşk's
 * values back. The tab strip links the other two settings pages.
 */
export function KoskSettings({ kosk, nazimCount, hostingCount }: Props) {
  const t = useTranslations("nizam.KoskSettings");
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [base, setBase] = useState(kosk);
  const [form, setForm] = useState<SettingsForm>(() => settingsFromKosk(kosk));
  const [sent, setSent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hiding, setHiding] = useState(false);

  const set = <K extends keyof SettingsForm>(key: K, value: SettingsForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const errors = settingsErrors(form);
  const dirty = isDirty(form, base);
  const show = (key: keyof typeof errors) =>
    sent && errors[key] ? t(`errors.${errors[key]}` as never) : undefined;
  const settingsBase = `/${locale}/kosks/${base.id}/ayarlar`;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setSent(true);
      return;
    }
    setSaving(true);
    const result = await updateKosk(base.id, settingsPayload(form, base));
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t(koskErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    setBase(result.data);
    setForm(settingsFromKosk(result.data));
    setSent(false);
    toast.success(t("saved"), {
      description: t("savedBody", { name: result.data.name }),
    });
    startTransition(() => router.refresh());
  };

  return (
    <div
      className="flex flex-col gap-6 [font-family:var(--font-ui)]"
      data-testid="kosk-settings"
    >
      <header className="flex max-w-[48rem] flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p>
          {t("intro", {
            koskGenitive: koskCase(base.name, locale, "genitive"),
          })}
        </p>
      </header>

      <Tabs
        mode="links"
        label={t("tabsLabel")}
        locale={locale}
        value="general"
        tabs={[
          { value: "general", label: t("tabs.general"), href: settingsBase },
          {
            value: "nazims",
            label: t("tabs.nazims"),
            href: `${settingsBase}/nazimlar`,
            count: nazimCount,
          },
          {
            value: "hosting",
            label: t("tabs.hosting"),
            href: `${settingsBase}/barindirma`,
            count: hostingCount,
          },
        ]}
      />

      <form
        className="flex max-w-[56rem] flex-col gap-8"
        onSubmit={submit}
        noValidate
      >
        <p className="mds-caption">* {t("requiredNote")}</p>

        <section className="flex flex-col gap-4">
          <h2 className="mds-h2">{t("infoHeading")}</h2>
          <div className="mds-card flex flex-col gap-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field
                label={t("nameLabel")}
                required
                help={t("nameHelp")}
                error={show("name")}
              >
                <Input
                  name="name"
                  value={form.name}
                  maxLength={KOSK_FORM_LIMITS.nameMax}
                  required
                  disabled={saving}
                  onChange={(e) => set("name", e.target.value)}
                />
              </Field>
              <Field label={t("handleLabel")} help={t("handleHelp")}>
                <Input
                  name="handle"
                  mono
                  readOnly
                  value={handleLabel(base.handle) ?? ""}
                />
              </Field>
              <Field
                label={t("fieldLabel")}
                required
                help={t("fieldHelp")}
                error={show("field")}
              >
                <Select
                  name="field"
                  placeholder={t("fieldPlaceholder")}
                  options={fieldOptions(base.field)}
                  value={form.field || null}
                  disabled={saving}
                  onChange={(value) => set("field", value ?? "")}
                />
              </Field>
              <Field
                label={t("levelLabel")}
                required
                help={t("levelHelp")}
                error={show("level")}
              >
                <Select
                  name="level"
                  placeholder={t("levelPlaceholder")}
                  options={FORM_LEVELS.map((level) => ({
                    value: level,
                    label: t(`levels.${level}`),
                  }))}
                  value={form.level || null}
                  disabled={saving}
                  onChange={(value) =>
                    set("level", (value ?? "") as KoskLevel | "")
                  }
                />
              </Field>
            </div>
            <Field
              label={t("tagsLabel")}
              help={t("tagsHelp")}
              error={show("tags")}
            >
              <Input
                name="tags"
                value={form.tags}
                disabled={saving}
                onChange={(e) => set("tags", e.target.value)}
              />
            </Field>
            <div className="flex flex-col gap-2">
              <RadioGroup
                legend={t("coverLegend")}
                name="cover"
                value={form.tone}
                disabled={saving}
                className="flex-row flex-wrap gap-x-6"
                onChange={(value) => set("tone", value as SettingsForm["tone"])}
                options={COVER_TONES.map((tone) => ({
                  value: tone,
                  label: t(`covers.${tone}`),
                  icon: <CoverPattern tone={tone} size="xs" />,
                }))}
              />
              <p className="mds-help">{t("coverHelp")}</p>
            </div>
            <Field label={t("descriptionLabel")} help={t("descriptionHelp")}>
              <Textarea
                name="description"
                value={form.description}
                maxLength={KOSK_FORM_LIMITS.descriptionMax}
                rows={4}
                disabled={saving}
                onChange={(e) => set("description", e.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="mds-h2">{t("visibilityHeading")}</h2>
          <Checkbox
            bordered
            label={t("unlistedLabel")}
            description={t("unlistedHelp")}
            icon={<Icon name="eyeOff" size="sm" />}
            checked={form.unlisted}
            disabled={saving}
            onCheckedChange={(checked) => set("unlisted", checked === true)}
          />
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h2 className="mds-h2">{t("policiesHeading")}</h2>
            <p className="mds-caption">{t("policiesIntro")}</p>
          </div>
          <Checkbox
            bordered
            label={t("approvalLabel")}
            description={t("approvalHelp")}
            icon={<Icon name="inbox" size="sm" />}
            checked={form.alwaysRequireApproval}
            disabled={saving}
            onCheckedChange={(checked) =>
              set("alwaysRequireApproval", checked === true)
            }
          />
          <Checkbox
            bordered
            label={t("recordingsLabel")}
            description={t("recordingsHelp")}
            icon={<Icon name="video" size="sm" />}
            checked={form.recordingsNeverPublic}
            disabled={saving}
            onCheckedChange={(checked) =>
              set("recordingsNeverPublic", checked === true)
            }
          />
        </section>

        <div className="flex items-center justify-end gap-3">
          <Button
            type="button"
            variant="ghost"
            disabled={saving || !dirty}
            onClick={() => {
              setForm(settingsFromKosk(base));
              setSent(false);
            }}
          >
            {t("cancel")}
          </Button>
          <Button type="submit" loading={saving} disabled={!dirty}>
            {t("save")}
          </Button>
        </div>
      </form>

      <section
        aria-labelledby="hide-heading"
        className="mds-card flex max-w-[56rem] flex-col gap-3"
      >
        <h2 id="hide-heading" className="mds-h2">
          {t("dangerHeading")}
        </h2>
        <p>{t("dangerBody")}</p>
        <div>
          <Button
            variant="outline"
            iconLeft={<Icon name="eyeOff" size="sm" />}
            onClick={() => setHiding(true)}
          >
            {t("hide")}
          </Button>
        </div>
      </section>

      <HideKoskDialog
        open={hiding}
        onOpenChange={setHiding}
        koskId={base.id}
        koskName={base.name}
        onHidden={() => router.push(`/${locale}/kosks`)}
      />
    </div>
  );
}
