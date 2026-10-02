"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { setHeadMuderris } from "../actions";
import { madrasahErrorKey, type PickedUser } from "../present";
import { HeadPicker } from "./head-picker";

export interface AssignTarget {
  id: string;
  name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: AssignTarget | null;
  /** called once the appointment is saved */
  onAssigned?: () => void;
}

/**
 * "Başmüderris ata" (nizam 07, the pasif row's button): the same e-mail
 * search as "Medrese aç", then the chosen account heads the medrese and a
 * passive one is active again. The design of nizam/22 (the köşk-and-medrese
 * "başmüderrisi değiştir" dialog) is a later package's; this is the small
 * dialog the Medreseler row needs to be usable on its own.
 */
export function AssignHeadDialog({
  open,
  onOpenChange,
  target,
  onAssigned,
}: Props) {
  const t = useTranslations("nizam.AssignHeadDialog");
  const tp = useTranslations("nizam.MadrasahsPage");
  const [head, setHead] = useState<PickedUser | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setHead(null);
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !head) return;
    setSaving(true);
    const result = await setHeadMuderris(target.id, head.id);
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(madrasahErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("saved"), {
      description: t("savedBody", { name: target.name, head: head.name }),
    });
    onAssigned?.();
    onOpenChange(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!saving) onOpenChange(next);
      }}
      form
      size="md"
      onSubmit={submit}
      eyebrow={target?.name}
      title={t("title")}
      closeLabel={t("close")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={saving} disabled={!head}>
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>{t("intro", { name: target?.name ?? "" })}</p>
      <HeadPicker
        value={head}
        onChange={setHead}
        disabled={saving}
        chosenNote={t("chosenNote")}
      />
    </Dialog>
  );
}
