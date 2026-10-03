"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { isBlank, REASON_MAX } from "../present";

export type RejectKind = "request" | "proposal";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: RejectKind;
  /** the deck or proposal the answer is for, above the title */
  subject: string | null;
  /** sends the reason; true when it was saved and the dialog may close */
  onSubmit: (reason: string) => Promise<boolean>;
}

/**
 * The reasoned refusal (canvas rule 17): "Ret gerekçesi*" and a "Reddet" that
 * stays disabled until the reason is written. Used for a publish request
 * (nizam 16) and for a müderris proposal (nizam 30).
 */
export function RejectDialog({
  open,
  onOpenChange,
  kind,
  subject,
  onSubmit,
}: Props) {
  const t = useTranslations("nizam.DeckReject");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const blank = isBlank(reason);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (blank) {
      setTouched(true);
      return;
    }
    setSaving(true);
    const saved = await onSubmit(reason.trim());
    setSaving(false);
    if (saved) onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      onSubmit={submit}
      eyebrow={subject ?? undefined}
      title={t(`${kind}.title`)}
      closeLabel={t("close")}
      initialFocus={reasonRef}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={blank}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>{t(`${kind}.body`)}</p>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <Field
        label={t("reasonLabel")}
        required
        help={t(`${kind}.help`)}
        error={touched && blank ? t("reasonRequired") : undefined}
      >
        <Textarea
          {...({ ref: reasonRef } as object)}
          name="reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={4}
          required
          onChange={(e) => setReason(e.target.value)}
          onBlur={() => setTouched(true)}
        />
      </Field>
    </Dialog>
  );
}
