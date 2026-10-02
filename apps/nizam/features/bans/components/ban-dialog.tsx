"use client";

import type { BanResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { createBan } from "../actions";
import { banErrorKey, isBlank, REASON_MAX } from "../present";

export interface BanTarget {
  userId: string;
  name: string;
  email: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  student: BanTarget | null;
  course: { id: string; title: string };
  koskName: string;
  /** whether "Köşkten de yasakla" is offered: the köşk nazımı and above */
  mayBanKosk: boolean;
  /** the next live session still to come, whose link the talebe may know */
  nextSessionAt?: string | null;
  /** called with the ban once it is saved */
  onBanned?: (ban: BanResponse) => void;
}

/**
 * "Talebeyi yasakla" (nizam 41): a Dialog with a Form. The scope defaults to
 * the course; the köşk is the köşk nazımı's. The reason is required — "Bir
 * gerekçe yazın." shows once the field has been left empty — and the button
 * stays off until there is one. The scrim does not close it, so a typed reason
 * is not lost to a stray click; a failure keeps it open.
 */
export function BanDialog({
  open,
  onOpenChange,
  student,
  course,
  koskName,
  mayBanKosk,
  nextSessionAt,
  onBanned,
}: Props) {
  const t = useTranslations("nizam.BanDialog");
  const tp = useTranslations("nizam.BansPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const [scope, setScope] = useState<"COURSE" | "KOSK">("COURSE");
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const reasonRef = useRef<HTMLElement | null>(null);

  // A new talebe starts from a clean form.
  useEffect(() => {
    if (open) {
      setScope("COURSE");
      setReason("");
      setTouched(false);
    }
  }, [open]);

  const blank = isBlank(reason);
  const showError = touched && blank;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!student) return;
    if (blank) {
      setTouched(true);
      return;
    }
    setSaving(true);
    const result = await createBan({
      courseId: course.id,
      userId: student.userId,
      scope,
      reason: reason.trim(),
    });
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(banErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("saved"), {
      description: t("savedBody", { name: student.name }),
    });
    onBanned?.(result.data);
    onOpenChange(false);
  };

  const when = nextSessionAt
    ? new Intl.DateTimeFormat(locale, {
        timeZone,
        day: "numeric",
        month: "long",
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(nextSessionAt))
    : null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      onSubmit={submit}
      eyebrow={course.title || t("eyebrowFallback")}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={reasonRef}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button
            type="submit"
            variant="destructive"
            loading={saving}
            disabled={blank}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      {student ? (
        <div className="flex items-center gap-3" data-testid="ban-target">
          <Avatar name={student.name} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold text-neutral-default">
              {student.name}
            </bdi>
            {student.email ? (
              <bdi dir="ltr" className="mds-caption font-mono">
                {student.email}
              </bdi>
            ) : null}
          </span>
        </div>
      ) : null}
      <p>{t("intro")}</p>
      <p>{t("visibility")}</p>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <RadioGroup
        legend={t("scopeLegend")}
        value={scope}
        onChange={(v) => setScope(v === "KOSK" ? "KOSK" : "COURSE")}
        bordered
        options={[
          {
            value: "COURSE",
            label: t("scopeCourse"),
            description: t("scopeCourseDesc", { course: course.title }),
          },
          {
            value: "KOSK",
            label: t("scopeKosk"),
            description: mayBanKosk
              ? t("scopeKoskDesc", { kosk: koskName })
              : t("scopeKoskOnlyNazim"),
            disabled: !mayBanKosk,
          },
        ]}
      />
      <Field
        label={t("reasonLabel")}
        required
        help={t("reasonHelp")}
        error={showError ? t("reasonRequired") : undefined}
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
      {when ? (
        <Alert tone="warning" title={t("rotateTitle")}>
          {t("rotateBody", { when })}
        </Alert>
      ) : null}
    </Dialog>
  );
}
