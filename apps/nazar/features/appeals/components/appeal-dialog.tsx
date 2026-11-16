"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { openAppeal } from "../actions";
import {
  APPEAL_REASON_MAX,
  type AppealRow,
  appealErrorKey,
  isBlank,
  listMoved,
} from "../appeals";

/**
 * "İtiraz aç": Gerekçe (required) and "Gönder", which stays off until there
 * is a reason. A refusal is a toast worded from the API's code; where it
 * means the list has moved the dialog closes and the list is read again.
 */
export function AppealDialog({
  madrasahId,
  row,
  onClose,
  onDone,
}: {
  madrasahId: string;
  row: AppealRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const reasonRef = useRef<HTMLElement | null>(null);
  const blank = isBlank(reason);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (blank) {
      setTouched(true);
      return;
    }
    startTransition(async () => {
      const result = await openAppeal(madrasahId, row.id, reason.trim());
      if (handleUnauthenticated(result)) return;
      if (result.success) {
        notify({
          title: t("Appeals.dialog.done"),
          description: t("Appeals.dialog.doneBody", { title: row.title }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("Appeals.dialog.failedTitle"),
        description: words(appealErrorKey(result.code)),
      });
      if (listMoved(result.code)) {
        onClose();
        onDone();
      }
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      onSubmit={submit}
      eyebrow={row.title}
      title={t("Appeals.dialog.title")}
      closeLabel={t("Shell.close")}
      initialFocus={reasonRef}
      footer={
        <>
          <DialogClose>{t("Appeals.dialog.cancel")}</DialogClose>
          <Button type="submit" loading={pending} disabled={blank}>
            {t("Appeals.dialog.submit")}
          </Button>
        </>
      }
    >
      <p className="mds-caption">* {t("Appeals.dialog.required")}</p>
      <Field
        label={t("Appeals.dialog.label")}
        required
        error={
          touched && blank ? t("Appeals.dialog.reasonRequired") : undefined
        }
      >
        <Textarea
          {...({ ref: reasonRef } as object)}
          name="reason"
          value={reason}
          maxLength={APPEAL_REASON_MAX}
          rows={4}
          required
          disabled={pending}
          onChange={(event) => setReason(event.target.value)}
          onBlur={() => setTouched(true)}
        />
      </Field>
    </Dialog>
  );
}
