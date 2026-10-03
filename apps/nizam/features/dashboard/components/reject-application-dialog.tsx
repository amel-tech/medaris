"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import type { Messages } from "../present";

/** The longest reason tedrisat keeps (`RejectEnrollmentDto`). */
export const REJECT_REASON_MAX = 500;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the talebe and the course, above the title */
  subject: string | null;
  /** sends the reason (empty when none was written); true when it was saved and the dialog may close */
  onSubmit: (reason: string) => Promise<boolean>;
}

/**
 * "Reddet" on a course application (nizam 02, canvas rule 17): a reason the
 * köşk nazımı may leave empty ("Ret gerekçesi (isteğe bağlı)"), so unlike the
 * other refusals the button is never held back. The reason is kept in the audit
 * log and is not sent to the talebe.
 */
export function RejectApplicationDialog({
  open,
  onOpenChange,
  subject,
  onSubmit,
}: Props) {
  const t = useTranslations("nizam.Dashboard") as unknown as Messages;
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      title={t("reject.title")}
      closeLabel={t("reject.close")}
      initialFocus={reasonRef}
      footer={
        <>
          <DialogClose>{t("reject.cancel")}</DialogClose>
          <Button type="submit" loading={saving}>
            {t("reject.submit")}
          </Button>
        </>
      }
    >
      <p>{t("reject.body")}</p>
      <Field label={t("reject.reasonLabel")} help={t("reject.help")}>
        <Textarea
          {...({ ref: reasonRef } as object)}
          name="reason"
          value={reason}
          maxLength={REJECT_REASON_MAX}
          rows={4}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}
