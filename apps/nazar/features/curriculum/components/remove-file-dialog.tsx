"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { useTranslations } from "next-intl";

/**
 * The question before a file row leaves a resources list (MDRS-287). Taking
 * it off is only a change to the form, which "Vazgeç" puts back; but the save
 * that follows deletes the file from storage for good, which a link never
 * had. So the remove asks, and says that, before the row goes.
 */
export function RemoveFileDialog({
  name,
  onConfirm,
  onClose,
}: {
  /** the row's name */
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("nazar");
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={t("Files.removeTitle")}
      confirmLabel={t("Files.removeConfirm")}
      cancelLabel={t("Files.cancel")}
      closeLabel={t("Shell.close")}
      confirmVariant="destructive"
      onConfirm={onConfirm}
    >
      <p>
        <bdi className="font-semibold text-neutral-default">{name}</bdi>{" "}
        {t("Files.removeBody")}
      </p>
      <p>{t("Files.removeNote")}</p>
    </AlertDialog>
  );
}
