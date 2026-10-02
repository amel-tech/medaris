"use client";

import type { KoskGrantResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { revokeGrant } from "../actions";
import { grantErrorKey, type Messages } from "../present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  grant: KoskGrantResponse | null;
  /** called once the post is taken away */
  onRevoked?: () => void;
}

/**
 * "Görevden al" of a ders nazırı (nizam 38, _kurallar 11 and 15): a Dialog
 * with a Form, "Vazgeç" has the focus and the scrim does not close it. A ders
 * nazırı cannot hand anything on (only a köşk nazımı gives permissions), so
 * there is no Devral/Düşür question: the post and every permission end
 * together.
 */
export function RevokeDialog({
  open,
  onOpenChange,
  koskId,
  grant,
  onRevoked,
}: Props) {
  const tm = useTranslations("nizam.KoskRevokeDialog");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.KoskGrantsPage");
  const [saving, setSaving] = useState(false);
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (open) setSaving(false);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!grant) return;
    setSaving(true);
    const result = await revokeGrant(koskId, grant.id);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(grantErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("revoked"), {
      description: t("revokedBody", {
        name: grant.user.name ?? grant.user.email ?? "",
        course: grant.course.title,
      }),
    });
    onRevoked?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      size="sm"
      onSubmit={submit}
      eyebrow={grant?.course.title}
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={cancelRef}
      footerMeta={t("auditNote")}
      footer={
        <>
          <DialogClose ref={cancelRef}>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>
        {t("intro", {
          name: grant?.user.name ?? grant?.user.email ?? "",
          course: grant?.course.title ?? "",
        })}
      </p>
      <p className="mds-caption">{t("effect")}</p>
    </Dialog>
  );
}
