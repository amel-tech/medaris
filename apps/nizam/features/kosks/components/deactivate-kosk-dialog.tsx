"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { deactivateKosk } from "../admin-actions";
import { koskErrorKey } from "../admin-present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  koskName: string;
  /** how many nazımları leave their post; says "no nazım" when none */
  nazimCount: number;
  /** called once the köşk is passive */
  onDeactivated?: () => void;
}

/**
 * "Köşkü pasife al" (nizam 20): a Dialog, not an AlertDialog (canvas rule 11:
 * a decision with consequences to read first). It names the köşk, says that
 * its nazımları are taken off the post and that nobody but the Medaris
 * yönetimi can then see what the köşk holds, and how it comes back: a nazım is
 * added. "Vazgeç" has the focus; the scrim does not close it.
 */
export function DeactivateKoskDialog({
  open,
  onOpenChange,
  koskId,
  koskName,
  nazimCount,
  onDeactivated,
}: Props) {
  const t = useTranslations("nizam.DeactivateKoskDialog");
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  const confirm = async () => {
    setSaving(true);
    const result = await deactivateKosk(koskId);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: t(koskErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("done"), {
      description: t("doneBody", { name: koskName }),
    });
    onOpenChange(false);
    onDeactivated?.();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      eyebrow={koskName}
      title={t("title")}
      closeLabel={t("close")}
      dismissible={false}
      initialFocus={cancelRef}
      footer={
        <>
          <DialogClose ref={cancelRef}>{t("cancel")}</DialogClose>
          <Button type="button" loading={saving} onClick={() => void confirm()}>
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p>
          {nazimCount > 0
            ? t("bodyNazims", { name: koskName, count: nazimCount })
            : t("bodyNoNazim", { name: koskName })}
        </p>
        <p className="mds-caption">{t("way")}</p>
      </div>
    </Dialog>
  );
}
