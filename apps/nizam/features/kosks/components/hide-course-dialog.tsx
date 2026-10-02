"use client";

import { toast } from "@medaris/ui/components/sonner";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { hideCourse } from "../course-actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courseId: string;
  courseTitle: string;
  /** called once the course is hidden */
  onHidden?: () => void;
}

/**
 * "Gizle" on a course (nizam 23): an AlertDialog, the confirmation that waits
 * for an answer (canvas rule 11). Hiding is not destructive — nothing is
 * deleted and the course comes back from the Arşiv — so the button is the
 * primary one, after a ghost "Vazgeç" that has the focus (rule 13).
 */
export function HideCourseDialog({
  open,
  onOpenChange,
  courseId,
  courseTitle,
  onHidden,
}: Props) {
  const t = useTranslations("nizam.HideCourseDialog");
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    const result = await hideCourse(courseId);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t("failedBody"),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("hidden"), {
      description: t("hiddenBody", { name: courseTitle }),
    });
    onOpenChange(false);
    onHidden?.();
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      eyebrow={courseTitle}
      title={t("title")}
      confirmLabel={t("confirm")}
      cancelLabel={t("cancel")}
      closeLabel={t("close")}
      confirmLoading={saving}
      onConfirm={() => void confirm()}
    >
      <p>{t("body", { name: courseTitle })}</p>
      <p className="mds-caption">{t("way")}</p>
    </AlertDialog>
  );
}
