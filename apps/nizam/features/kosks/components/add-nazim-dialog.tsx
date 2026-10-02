"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { PickedUser } from "../../madrasahs/present";
import { addKoskNazims } from "../admin-actions";
import {
  endsAtOf,
  isoDay,
  isPastDay,
  koskCase,
  koskErrorKey,
} from "../admin-present";
import { NazimPicker } from "./nazim-picker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  koskName: string;
  /** called once the nazımları are added */
  onAdded?: () => void;
}

/**
 * "Köşk nazımı ekle" (nizam 21): a Dialog with a Form — the accounts found by
 * e-mail (one or more) and an optional end of the post. "Ekle" is off until
 * somebody is chosen, and a date in the past is refused under its field. The
 * scrim does not close it; the picker has the focus. Someone who already is a
 * nazım of the köşk is the server's refusal and is said in a toast.
 */
export function AddNazimDialog({
  open,
  onOpenChange,
  koskId,
  koskName,
  onAdded,
}: Props) {
  const t = useTranslations("nizam.AddNazimDialog");
  const tp = useTranslations("nizam.KoskNazimPicker");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const [people, setPeople] = useState<PickedUser[]>([]);
  const [day, setDay] = useState("");
  const [saving, setSaving] = useState(false);
  const [sent, setSent] = useState(false);
  const emailRef = useRef<HTMLElement | null>(null);
  const today = useMemo(() => isoDay(new Date(), timeZone), [timeZone]);

  // A new addition starts from a clean form.
  useEffect(() => {
    if (open) {
      setPeople([]);
      setDay("");
      setSent(false);
    }
  }, [open]);

  const past = isPastDay(day, new Date(), timeZone);
  const ready = people.length > 0 && !past;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) {
      setSent(true);
      return;
    }
    setSaving(true);
    const result = await addKoskNazims(
      koskId,
      people.map((p) => p.id),
      endsAtOf(day, timeZone)
    );
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t(koskErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("saved"), {
      description: t("savedBody", {
        names: people.map((p) => p.name).join(", "),
        kosk: koskCase(koskName, locale, "genitive"),
      }),
    });
    onAdded?.();
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
      eyebrow={koskName}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={emailRef}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={!ready}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>
        {t("intro", { koskGenitive: koskCase(koskName, locale, "genitive") })}
      </p>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <NazimPicker
        value={people}
        onChange={setPeople}
        disabled={saving}
        inputRef={emailRef}
        error={sent ? tp("required") : undefined}
      />
      <div className="max-w-[16rem]">
        <Field
          label={t("endLabel")}
          help={t("endHelp")}
          error={past ? t("errors.endPast") : undefined}
        >
          <Input
            type="date"
            name="endsAt"
            min={today}
            value={day}
            disabled={saving}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
      </div>
      <p className="mds-caption">{t("footnote")}</p>
    </Dialog>
  );
}
