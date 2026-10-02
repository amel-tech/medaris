"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { REASON_MAX } from "~/features/bans/present";
import { removeEnrollment } from "~/features/kosks/actions/courses";
import { courseTeamErrorKey } from "~/features/kosks/course-team";

export interface RemoveTarget {
  userId: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  course: { id: string; title: string };
  target: RemoveTarget | null;
  /** called with the talebe's id once they are out */
  onRemoved?: (userId: string) => void;
}

/**
 * "Dersten çıkar" (nizam 58): a Dialog with a Form, the reason required. The
 * seat goes and the reason is kept for the course team; the talebe may apply
 * again, and "Yasakla" is what stops that. The button stays off until there is
 * a reason, and nothing is written under the field before then (the design
 * draws no error here). The scrim does not close it, so a typed reason is not
 * lost to a stray click.
 */
export function RemoveDialog({
  open,
  onOpenChange,
  koskId,
  course,
  target,
  onRemoved,
}: Props) {
  const t = useTranslations("nizam.RemoveDialog");
  const tt = useTranslations("nizam");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const blank = reason.trim().length === 0;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || blank) return;
    setSaving(true);
    const result = await removeEnrollment(
      koskId,
      course.id,
      target.userId,
      reason.trim()
    );
    setSaving(false);
    if (!result.success) {
      const key = courseTeamErrorKey(result.errorBody);
      toast.error(t("failed"), {
        description: key ? tt(key) : result.error,
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("removed"), {
      description: t("removedBody", { name: target.name }),
    });
    onRemoved?.(target.userId);
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      onSubmit={submit}
      eyebrow={course.title}
      title={t("title")}
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
      <p>
        {t.rich("body", {
          name: target?.name ?? "",
          course: course.title,
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      <Alert tone="neutral">
        <p>{t("info")}</p>
      </Alert>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <Field label={t("reasonLabel")} required help={t("reasonHelp")}>
        <Textarea
          {...({ ref: reasonRef } as object)}
          name="reason"
          value={reason}
          maxLength={REASON_MAX}
          rows={4}
          required
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
    </Dialog>
  );
}
