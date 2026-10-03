"use client";

import { toast } from "@medaris/ui/components/sonner";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { hideKosk } from "../admin-actions";
import { koskErrorKey } from "../admin-present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  koskName: string;
  /** called once the köşk is hidden */
  onHidden?: () => void;
}

/**
 * "Köşkü gizle" (nizam 24): an AlertDialog, the confirmation that waits for an
 * answer. Hiding is not destructive — nothing is deleted and the Medaris
 * yönetimi brings the köşk back from the Arşiv — so the button is the primary
 * one, after a ghost "Vazgeç" that has the focus. The text names the köşk and
 * who loses sight of it, then the way back.
 */
export function HideKoskDialog({
  open,
  onOpenChange,
  koskId,
  koskName,
  onHidden,
}: Props) {
  const t = useTranslations("nizam.HideKoskDialog");
  const [saving, setSaving] = useState(false);

  const confirm = async () => {
    setSaving(true);
    const result = await hideKosk(koskId);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t(koskErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("hidden"), {
      description: t("hiddenBody", { name: koskName }),
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
      eyebrow={koskName}
      title={t("title")}
      confirmLabel={t("confirm")}
      cancelLabel={t("cancel")}
      closeLabel={t("close")}
      confirmLoading={saving}
      onConfirm={() => void confirm()}
    >
      <p>{t("body", { name: koskName })}</p>
      <p className="mds-caption">{t("way")}</p>
    </AlertDialog>
  );
}
