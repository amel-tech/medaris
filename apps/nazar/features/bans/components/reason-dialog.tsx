"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { escalateBan, liftBan, requestPermanentBan } from "../actions";
import {
  type BanRow,
  banErrorKey,
  isBlank,
  listMoved,
  REASON_MAX,
} from "../bans";

export type ReasonKind = "lift" | "escalate" | "permanent";

const ACTION = {
  lift: liftBan,
  escalate: escalateBan,
  permanent: requestPermanentBan,
} as const;

/**
 * The three decisions on a ban that take a reason: "Yasağı kaldır", "Medreseden
 * de yasakla" and "Kalıcı yasak talebi aç" (nazir 11; _kurallar 17). A form
 * dialog whose focus starts in the reason, whose button stays off until there
 * is one ("Bir gerekçe yazın." once the field has been left empty) and which
 * the scrim does not close, so a typed reason is not lost to a stray click.
 * The ban's summary stands above the field. A refusal is a toast worded from
 * the API's code; where it means the list has moved (the ban is already lifted,
 * or gone) the dialog closes and the list is read again.
 */
export function ReasonDialog({
  kind,
  row,
  madrasahName,
  onClose,
  onDone,
}: {
  kind: ReasonKind;
  row: BanRow;
  madrasahName: string;
  onClose: () => void;
  /** called once the decision is saved, or the list has moved, for the page to read it again */
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
      const result = await ACTION[kind](row.id, reason.trim());
      if (result.success) {
        notify({
          title: t(`Reasons.${kind}.done`),
          description: t(`Reasons.${kind}.doneBody`, { name: row.name }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t(`Reasons.${kind}.failedTitle`),
        description: words(banErrorKey(result.code)),
      });
      if (listMoved(result.code)) {
        onClose();
        onDone();
      }
    });
  };

  const course = row.courseTitle ?? "";
  const body =
    kind === "lift"
      ? row.scope.kind === "COURSE"
        ? t("Reasons.lift.bodyCourse", { course })
        : t("Reasons.lift.bodyMadrasah")
      : kind === "escalate"
        ? t("Reasons.escalate.body", { course })
        : t("Reasons.permanent.body");

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      onSubmit={submit}
      eyebrow={madrasahName}
      title={t(`Reasons.${kind}.title`)}
      closeLabel={t("Shell.close")}
      initialFocus={reasonRef}
      footer={
        <>
          <DialogClose>{t("Reasons.cancel")}</DialogClose>
          <Button type="submit" loading={pending} disabled={blank}>
            {t(`Reasons.${kind}.submit`)}
          </Button>
        </>
      }
    >
      <div className="flex items-center gap-3" data-testid="ban-person">
        <Avatar name={row.name} decorative />
        <span className="flex min-inline-0 flex-col">
          <bdi className="font-semibold text-neutral-default">{row.name}</bdi>
          {row.email ? (
            <bdi dir="ltr" className="mds-caption break-all font-mono">
              {row.email}
            </bdi>
          ) : null}
        </span>
      </div>
      <dl
        className="flex flex-col rounded-surface border border-neutral-subtle px-4"
        data-testid="ban-summary"
      >
        {(
          [
            ["scope", row.summary.scope],
            ["bannedBy", row.summary.bannedBy],
            ["reason", row.summary.reason],
          ] as const
        ).map(([key, value]) => (
          <div
            key={key}
            className="flex flex-col gap-1 py-3 border-be border-neutral-subtle last:border-be-0"
          >
            <dt className="mds-caption">{t(`Reasons.summary.${key}`)}</dt>
            <dd className="m-0 text-neutral-default">
              <bdi>{value}</bdi>
            </dd>
          </div>
        ))}
      </dl>
      <p>{body}</p>
      <p className="mds-caption">* {t("Reasons.required")}</p>
      <Field
        label={t(`Reasons.${kind}.label`)}
        required
        help={t(`Reasons.${kind}.help`)}
        error={touched && blank ? t("Reasons.reasonRequired") : undefined}
      >
        <Textarea
          {...({ ref: reasonRef } as object)}
          name="reason"
          value={reason}
          maxLength={REASON_MAX}
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
