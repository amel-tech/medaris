"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { banFromCourse } from "../actions";
import {
  banErrorKey,
  courseBanRequest,
  isBlank,
  REASON_MAX,
  type Talebe,
} from "../bans";

/**
 * "Yasakla" of a course's Yasaklamalar: bars one of this course's talebe from
 * this course (`POST /courses/:courseId/bans`). The talebe is chosen from the
 * course's own roster, so nobody outside the course can be picked; the reason
 * is required, as in the medrese's dialog, and the scrim does not close it.
 */
export function CourseBanDialog({
  courseId,
  courseTitle,
  talebe,
  onClose,
  onDone,
}: {
  courseId: string;
  courseTitle: string;
  talebe: readonly Talebe[];
  onClose: () => void;
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [userId, setUserId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const blank = isBlank(reason);
  const picked = talebe.find((one) => one.id === userId) ?? null;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending || !picked) return;
    if (blank) {
      setTouched(true);
      return;
    }
    startTransition(async () => {
      const result = await banFromCourse(
        courseId,
        courseBanRequest({ userId: picked.id, reason })
      );
      if (handleUnauthenticated(result)) return;
      if (result.success) {
        notify({
          title: t("BanDialog.saved"),
          description: t("BanDialog.savedCourse", {
            name: picked.name,
            course: courseTitle,
          }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("BanDialog.failedTitle"),
        description: words(banErrorKey(result.code)),
      });
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
      eyebrow={courseTitle}
      title={t("BanDialog.title")}
      closeLabel={t("Shell.close")}
      footer={
        <>
          <DialogClose>{t("BanDialog.cancel")}</DialogClose>
          <Button
            type="submit"
            loading={pending}
            disabled={blank || picked === null}
          >
            {t("BanDialog.submit")}
          </Button>
        </>
      }
    >
      <p>{t("BanDialog.intro")}</p>
      <p className="mds-caption">* {t("BanDialog.required")}</p>
      <Field label={t("CourseBans.talebeLabel")} required>
        <Select
          name="talebe"
          aria-label={t("CourseBans.talebeLabel")}
          placeholder={t("CourseBans.talebePlaceholder")}
          options={talebe.map((one) => ({ value: one.id, label: one.name }))}
          value={userId}
          disabled={pending}
          onChange={setUserId}
        />
      </Field>
      <Field
        label={t("BanDialog.reasonLabel")}
        required
        help={t("BanDialog.reasonHelp")}
        error={touched && blank ? t("BanDialog.reasonRequired") : undefined}
      >
        <Textarea
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

/**
 * The "Yasakla" button of a course's Yasaklamalar. With no talebe left to bar
 * (or a roster that could not be read) the button stays off and says why.
 */
export function CourseBanButton({
  courseId,
  courseTitle,
  talebe,
  disabledReason,
}: {
  courseId: string;
  courseTitle: string;
  talebe: readonly Talebe[];
  /** why there is no one to choose; null when there is */
  disabledReason: string | null;
}) {
  const t = useTranslations("nazar");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        iconLeft={<Icon name="ban" size="sm" />}
        disabled={disabledReason !== null}
        onClick={() => setOpen(true)}
      >
        {t("Bans.ban")}
      </Button>
      {disabledReason ? (
        <span className="mds-caption" data-testid="ban-off">
          {disabledReason}
        </span>
      ) : null}
      {open ? (
        <CourseBanDialog
          courseId={courseId}
          courseTitle={courseTitle}
          talebe={talebe}
          onClose={() => setOpen(false)}
          onDone={() => router.refresh()}
        />
      ) : null}
    </div>
  );
}
