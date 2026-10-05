"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { isBlank, REASON_MAX } from "~/features/bans/bans";
import type { Messages } from "~/lib/i18n/messages";
import { removeStudent } from "../actions";
import { enrolmentErrorKey, seatMoved } from "../enrolments";

/**
 * "Dersten çıkar": a form dialog with the reason required, whose focus starts
 * in the reason, whose button stays off until there is one ("Bir gerekçe
 * yazın." once the field has been left empty) and which the scrim does not
 * close, so a typed reason is not lost to a stray click. The seat goes and the
 * reason is kept for the course team; the talebe cannot apply again, and only
 * the team's approval brings the seat back. A seat that is no longer as the
 * page showed it closes the dialog and the list is read again.
 */
export function RemoveDialog({
  courseId,
  courseName,
  person,
  onClose,
  onDone,
}: {
  courseId: string;
  courseName: string;
  person: { userId: string; name: string };
  onClose: () => void;
  /** called once the talebe is out, or the seat has moved, for the page to read it again */
  onDone: () => void;
}) {
  const t = useTranslations("nazir");
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
      const result = await removeStudent(
        courseId,
        person.userId,
        reason.trim()
      );
      if (result.success) {
        notify({
          title: t("CourseStudents.remove.done"),
          description: t("CourseStudents.remove.doneBody", {
            name: person.name,
          }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: seatMoved(result.code) ? "info" : "error",
        title: t("CourseStudents.remove.failedTitle"),
        description: words(enrolmentErrorKey(result.code)),
      });
      if (seatMoved(result.code)) {
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
      size="md"
      onSubmit={submit}
      eyebrow={courseName}
      title={t("CourseStudents.remove.title")}
      closeLabel={t("Shell.close")}
      initialFocus={reasonRef}
      footer={
        <>
          <DialogClose>{t("CourseStudents.remove.cancel")}</DialogClose>
          <Button type="submit" loading={pending} disabled={blank}>
            {t("CourseStudents.remove.submit")}
          </Button>
        </>
      }
    >
      <p>
        {t("CourseStudents.remove.body", {
          name: person.name,
          course: courseName,
        })}
      </p>
      <Alert tone="neutral">
        <p>{t("CourseStudents.remove.info")}</p>
      </Alert>
      <p className="mds-caption">* {t("CourseStudents.remove.required")}</p>
      <Field
        label={t("CourseStudents.remove.reasonLabel")}
        required
        help={t("CourseStudents.remove.reasonHelp")}
        error={
          touched && blank
            ? t("CourseStudents.remove.reasonRequired")
            : undefined
        }
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
