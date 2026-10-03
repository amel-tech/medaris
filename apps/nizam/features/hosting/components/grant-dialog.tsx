"use client";

import type { MadrasahResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Select } from "@medaris/ui/mds/select";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { grantHostingRight } from "../actions";
import { hostingErrorKey } from "../present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  koskId: string;
  koskName: string;
  /** the medreses that can still be given the right; null when they could not be read */
  options: Pick<MadrasahResponse, "id" | "name" | "handle">[] | null;
  /** called once the right is given */
  onGranted?: () => void;
}

/**
 * "Barındırma hakkı ver" (nizam 26): pick a medrese, give it the right. The
 * canvas draws no picker, so this is the smallest one the action needs: a
 * Dialog with a Form and one Select, the button off until a medrese is
 * chosen. The medreses already holding the right are not offered.
 */
export function GrantDialog({
  open,
  onOpenChange,
  koskId,
  koskName,
  options,
  onGranted,
}: Props) {
  const t = useTranslations("nizam.GrantDialog");
  const tp = useTranslations("nizam.HostingPage");
  const [madrasahId, setMadrasahId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setMadrasahId(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!madrasahId) return;
    const chosen = options?.find((m) => m.id === madrasahId);
    setSaving(true);
    const result = await grantHostingRight(koskId, madrasahId);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(hostingErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("granted"), {
      description: t("grantedBody", {
        name: chosen?.name ?? result.data.name,
        kosk: koskName,
      }),
    });
    onGranted?.();
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
      eyebrow={koskName}
      title={t("title")}
      closeLabel={t("close")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={madrasahId === null}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>{t("intro", { kosk: koskName })}</p>
      {options === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
        </Alert>
      ) : options.length === 0 ? (
        <p className="mds-caption">{t("none")}</p>
      ) : (
        <Field label={t("madrasahLabel")} required>
          <Select
            name="madrasahId"
            placeholder={t("placeholder")}
            value={madrasahId}
            required
            disabled={saving}
            onChange={setMadrasahId}
            options={options.map((m) => ({
              value: m.id,
              label: `${m.name} (@${m.handle})`,
            }))}
          />
        </Field>
      )}
    </Dialog>
  );
}
