"use client";

import type { KoskLevel } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { cleanHandle, type PickedUser } from "../../madrasahs/present";
import { openKosk } from "../admin-actions";
import {
  COVER_TONES,
  canOpen,
  emptyOpenForm,
  FORM_LEVELS,
  fieldOptions,
  koskErrorKey,
  type OpenKoskForm,
  openErrors,
  openPayload,
} from "../admin-present";
import { KOSK_FORM_LIMITS } from "../kosk-form";
import { NazimPicker } from "./nazim-picker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** called with the new köşk's name once it is saved */
  onOpened?: (name: string) => void;
}

type Touched = Partial<Record<"name" | "handle" | "field" | "level", boolean>>;

/**
 * "Köşk aç" (nizam 10): a Dialog with a Form — ad, kısa ad, alan, seviye,
 * etiketler, açıklama, kapak rengi, listeleme and the köşk nazımları found by
 * e-mail. The button stays off until the name, field, level and at least one
 * nazım are right; a short name the server finds taken answers under its own
 * field. The scrim does not close it, so typed input is not lost to a stray
 * click, and a failure keeps it open. The name has the focus.
 */
export function OpenKoskDialog({ open, onOpenChange, onOpened }: Props) {
  const t = useTranslations("nizam.OpenKoskDialog");
  const tp = useTranslations("nizam.KoskNazimPicker");
  const [form, setForm] = useState<OpenKoskForm>(emptyOpenForm);
  const [people, setPeople] = useState<PickedUser[]>([]);
  const [touched, setTouched] = useState<Touched>({});
  const [sent, setSent] = useState(false);
  const [taken, setTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLElement | null>(null);

  // A new opening starts from a clean form.
  useEffect(() => {
    if (open) {
      setForm(emptyOpenForm());
      setPeople([]);
      setTouched({});
      setSent(false);
      setTaken(false);
    }
  }, [open]);

  const set = <K extends keyof OpenKoskForm>(key: K, value: OpenKoskForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const current: OpenKoskForm = { ...form, nazimIds: people.map((p) => p.id) };
  const errors = openErrors(current);
  const show = (key: keyof Touched) =>
    (touched[key] || sent) && errors[key]
      ? t(`errors.${errors[key]}` as never)
      : undefined;
  const touch = (key: keyof Touched) =>
    setTouched((s) => ({ ...s, [key]: true }));

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canOpen(current)) {
      setSent(true);
      return;
    }
    setSaving(true);
    const result = await openKosk(openPayload(current));
    setSaving(false);
    if (!result.success) {
      const key = koskErrorKey(result.errorBody);
      if (key === "errors.handleTaken") {
        setTaken(true);
        return;
      }
      toast.error(t("failed"), {
        description: t(key as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("saved"), {
      description: t("savedBody", { name: result.data.name }),
    });
    onOpened?.(result.data.name);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      size="md"
      onSubmit={submit}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={nameRef}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button
            type="submit"
            loading={saving}
            disabled={!canOpen(current) || taken}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>{t("intro")}</p>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={t("nameLabel")}
          required
          help={t("nameHelp")}
          error={show("name")}
        >
          <Input
            {...({ ref: nameRef } as object)}
            name="name"
            value={form.name}
            maxLength={KOSK_FORM_LIMITS.nameMax}
            required
            disabled={saving}
            onChange={(e) => set("name", e.target.value)}
            onBlur={() => touch("name")}
          />
        </Field>
        <Field
          label={t("handleLabel")}
          help={t("handleHelp")}
          error={
            taken
              ? t("errors.handleTaken", { handle: cleanHandle(form.handle) })
              : show("handle")
          }
        >
          <Input
            name="handle"
            mono
            autoComplete="off"
            spellCheck={false}
            leading={<span aria-hidden="true">@</span>}
            value={form.handle}
            disabled={saving}
            onChange={(e) => {
              set("handle", e.target.value);
              setTaken(false);
            }}
            onBlur={() => touch("handle")}
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
            options={fieldOptions(null)}
            value={form.field || null}
            disabled={saving}
            onChange={(value) => {
              set("field", value ?? "");
              touch("field");
            }}
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
            onChange={(value) => {
              set("level", (value ?? "") as KoskLevel | "");
              touch("level");
            }}
          />
        </Field>
      </div>
      <Field
        label={t("tagsLabel")}
        help={t("tagsHelp")}
        error={sent && errors.tags ? t(`errors.${errors.tags}`) : undefined}
      >
        <Input
          name="tags"
          value={form.tags}
          disabled={saving}
          onChange={(e) => set("tags", e.target.value)}
        />
      </Field>
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
      <div className="flex flex-col gap-2">
        <RadioGroup
          legend={t("coverLegend")}
          name="cover"
          value={form.tone}
          disabled={saving}
          className="flex-row flex-wrap gap-x-3"
          onChange={(value) => set("tone", value as OpenKoskForm["tone"])}
          options={COVER_TONES.map((tone) => ({
            value: tone,
            label: t(`covers.${tone}`),
            icon: <CoverPattern tone={tone} size="xs" />,
          }))}
        />
        <p className="mds-help">{t("coverHelp")}</p>
      </div>
      <Checkbox
        bordered
        className="shrink-0"
        label={t("unlistedLabel")}
        description={t("unlistedHelp")}
        icon={<Icon name="eyeOff" size="sm" />}
        checked={form.unlisted}
        disabled={saving}
        onCheckedChange={(checked) => set("unlisted", checked === true)}
      />
      <NazimPicker
        value={people}
        onChange={setPeople}
        disabled={saving}
        error={sent ? tp("required") : undefined}
      />
    </Dialog>
  );
}
