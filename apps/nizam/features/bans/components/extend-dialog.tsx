"use client";

import type { BanResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { extendBan } from "../actions";
import { banErrorKey, isBlank, REASON_MAX } from "../present";

export interface ExtendTarget {
  banId: string;
  name: string;
  email: string | null;
  /** the course the ban sits on, shown above the title */
  courseTitle: string | null;
  koskName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ExtendTarget | null;
  /** called with the new, wider ban once it is saved */
  onExtended?: (ban: BanResponse) => void;
}

/**
 * "Yasağı genişlet" (nizam 48): a course ban moves up to the whole köşk. The
 * design draws no window for it, so this is the lift window's sibling — a
 * Dialog with a Form and a required reason, the focus on the field, the scrim
 * not closing it. The wider ban keeps its own reason; the course ban stands.
 */
export function ExtendDialog({
  open,
  onOpenChange,
  target,
  onExtended,
}: Props) {
  const t = useTranslations("nizam.ExtendDialog");
  const tp = useTranslations("nizam.BansPage");
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
    if (!target) return;
    if (blank) {
      setTouched(true);
      return;
    }
    setSaving(true);
    const result = await extendBan(target.banId, reason.trim());
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(banErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("extended"), {
      description: t("extendedBody", {
        name: target.name,
        kosk: target.koskName,
      }),
    });
    onExtended?.(result.data);
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
      eyebrow={target?.courseTitle ?? undefined}
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
      {target ? (
        <div className="flex items-center gap-3" data-testid="extend-target">
          <Avatar name={target.name} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold text-neutral-default">
              {target.name}
            </bdi>
            {target.email ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {target.email}
              </bdi>
            ) : null}
          </span>
        </div>
      ) : null}
      <p>
        {t.rich("info", {
          name: target?.name ?? "",
          kosk: target?.koskName ?? "",
          b: (chunks) => <strong>{chunks}</strong>,
        })}
      </p>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <Field
        label={t("reasonLabel")}
        required
        help={t("reasonHelp")}
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
