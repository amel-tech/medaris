"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { hideCourse } from "../actions";
import { type CourseRow, courseErrorKey } from "../courses";

/**
 * "Dersi gizle" (nazir 18): the question before a medrese course leaves the
 * list. Hiding is not destructive (nothing is deleted and the Arşiv brings the
 * course back), so the answer is an AlertDialog whose focus starts on "Vazgeç"
 * and whose action is a primary "Gizle" (_kurallar 11, 13). The scrim does not
 * close it. A course that is already hidden, or gone, is what the başmüderris
 * wanted: the list is read again and says so, not an error.
 */
export function HideCourse({
  madrasahId,
  madrasahName,
  course,
  onClose,
  onDone,
}: {
  madrasahId: string;
  madrasahName: string;
  /** the course the question is about */
  course: CourseRow;
  onClose: () => void;
  /** called once the course is hidden, or was already, for the page to read the list again */
  onDone: () => void;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();

  const hide = () =>
    startTransition(async () => {
      const result = await hideCourse(madrasahId, course.id);
      if (result.success) {
        notify({
          title: t("HideCourse.done"),
          description: t("HideCourse.doneBody", { title: course.title }),
        });
      } else if (result.code === "MADRASAH_COURSE_ALREADY_HIDDEN") {
        notify({
          tone: "info",
          title: t("HideCourse.alreadyTitle"),
          description: t("HideCourse.already"),
        });
      } else {
        notify({
          tone: "error",
          title: t("HideCourse.failedTitle"),
          description: words(courseErrorKey(result.code)),
        });
      }
      onClose();
      // The list has moved after a hiding, a course already hidden and a course that is gone.
      if (
        result.success ||
        result.code === "MADRASAH_COURSE_ALREADY_HIDDEN" ||
        result.code === "MADRASAH_COURSE_NOT_FOUND"
      ) {
        onDone();
      }
    });

  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      eyebrow={madrasahName}
      title={t("HideCourse.title")}
      confirmLabel={t("HideCourse.confirm")}
      cancelLabel={t("HideCourse.cancel")}
      closeLabel={t("Shell.close")}
      confirmLoading={pending}
      onConfirm={hide}
    >
      <p>
        <bdi className="font-semibold text-neutral-default">{course.title}</bdi>{" "}
        {course.hide.rest}
        {course.hide.affected ? ` ${course.hide.affected}` : ""}
      </p>
      <p>{t("HideCourse.note")}</p>
    </AlertDialog>
  );
}
