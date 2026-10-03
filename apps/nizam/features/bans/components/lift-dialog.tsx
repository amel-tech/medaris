"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { liftBan } from "../actions";
import { banErrorKey, isBlank, REASON_MAX } from "../present";

export interface LiftTarget {
  banId: string;
  name: string;
  email: string | null;
  /** the course the ban sits on, shown above the title */
  courseTitle: string | null;
  /** the summary the Yasaklamalar page shows; the roster has none of it */
  summary?: {
    scope: string;
    bannedBy: string;
    bannedAt: string;
    reason: string;
    role: string;
    /** the role as the info line names it: "dersin müderrisi" */
    rolePhrase: string;
  };
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: LiftTarget | null;
  /** how the viewer is called in the info line: "köşk nazımı" */
  viewerRole?: string;
  /** called with the lifted ban's id once it is saved */
  onLifted?: (banId: string) => void;
}

/**
 * "Yasağı kaldır" (nizam 42): the ban's summary, then the reason for lifting.
 * The kademe rule is the server's; a row whose button was offered still gets a
 * refusal, shown as a toast, if the ban was meanwhile lifted or the standing
 * changed.
 */
export function LiftDialog({
  open,
  onOpenChange,
  target,
  viewerRole,
  onLifted,
}: Props) {
  const t = useTranslations("nizam.LiftDialog");
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
    const result = await liftBan(target.banId, reason.trim());
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(banErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("lifted"), {
      description: t("liftedBody", { name: target.name }),
    });
    onLifted?.(target.banId);
    onOpenChange(false);
  };

  const summary = target?.summary;
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
        <div className="flex items-center gap-3" data-testid="lift-target">
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
      {summary ? (
        <dl
          className="flex flex-col rounded-surface border border-neutral-subtle px-4"
          data-testid="lift-summary"
        >
          {[
            [t("scope"), summary.scope],
            [t("bannedBy"), `${summary.bannedBy} · ${summary.bannedAt}`],
            [t("reason"), summary.reason],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex flex-col gap-1 border-be border-neutral-subtle py-3 last:border-0"
            >
              <dt className="mds-caption">{label}</dt>
              <dd className="m-0 text-neutral-default">{value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p>
        {summary && viewerRole
          ? t.rich("info", {
              role: summary.rolePhrase,
              viewer: viewerRole,
              name: target?.name ?? "",
              b: (chunks) => <strong>{chunks}</strong>,
            })
          : t.rich("infoSimple", {
              name: target?.name ?? "",
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
