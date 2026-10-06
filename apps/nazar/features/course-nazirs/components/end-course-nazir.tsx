"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useRef, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { endCourseNazir } from "../actions";
import {
  type CourseNazirRow,
  courseNazirErrorKey,
  listMoved,
} from "../course-nazirs";

/**
 * "Görevden al" of a ders nazırı (MDRS-270): a Dialog with a Form, "Vazgeç"
 * has the focus and the scrim does not close it. The post and every
 * permission its holder has in the course end together. There is no
 * Devral/Düşür question: what a ders nazırı handed on is a post with no
 * permission of their giving, which the API asks to be ended first
 * (DISMISS_SEAT_HANDED_ON); the refusal closes the dialog and the list, read
 * again, shows who is in the way.
 */
export function EndCourseNazir({
  courseId,
  courseTitle,
  row,
  onClose,
  onDone,
}: {
  courseId: string;
  courseTitle: string;
  /** the post being ended; null while the dialog is shut */
  row: CourseNazirRow | null;
  onClose: () => void;
  /** called once the list has changed, for the page to read it again */
  onDone: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!row || pending) return;
    startTransition(async () => {
      const result = await endCourseNazir(courseId, row.id);
      if (result.success) {
        notify({
          tone: "success",
          title: t("CourseNazirs.dismiss.done"),
          description: t("CourseNazirs.dismiss.doneBody", {
            name: row.name,
            course: courseTitle,
          }),
        });
        onClose();
        onDone();
        return;
      }
      notify({
        tone: "error",
        title: t("CourseNazirs.dismiss.failed"),
        description: words(courseNazirErrorKey(result.code)),
      });
      if (listMoved(result.code) || result.code === "DISMISS_SEAT_HANDED_ON") {
        onClose();
        onDone();
      }
    });
  };

  return (
    <Dialog
      open={row !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      size="sm"
      onSubmit={submit}
      eyebrow={courseTitle}
      title={t("CourseNazirs.dismiss.title")}
      closeLabel={t("Shell.close")}
      initialFocus={cancelRef}
      footerMeta={t("CourseNazirs.dismiss.auditNote")}
      footer={
        <>
          <DialogClose ref={cancelRef}>
            {t("CourseNazirs.dismiss.cancel")}
          </DialogClose>
          <Button type="submit" loading={pending}>
            {t("CourseNazirs.dismiss.submit")}
          </Button>
        </>
      }
    >
      <p>
        {t("CourseNazirs.dismiss.intro", {
          name: row?.name ?? "",
          course: courseTitle,
        })}
      </p>
      <p className="mds-caption">{t("CourseNazirs.dismiss.effect")}</p>
    </Dialog>
  );
}
