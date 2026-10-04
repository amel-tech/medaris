"use client";

import type { InactiveScopeResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { resolveEnd } from "@medaris/utils";
import { useTimeZone, useTranslations } from "next-intl";
import { type FormEvent, useEffect, useState } from "react";
import { HeadPicker } from "../../madrasahs/components/head-picker";
import type { PickedUser } from "../../madrasahs/present";
import { assignScope } from "../actions";
import { inactiveErrorKey, type Messages } from "../present";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: InactiveScopeResponse | null;
  /** called once the scope has its manager */
  onAssigned?: () => void;
}

/**
 * "Başmüderris ata" / "Köşk nazımı ata" / "Müderris ata" (nizam 14): the same
 * e-mail search as the other pickers and an optional "Görev bitişi", in a
 * Dialog with a Form. The scope is active again once it is saved; the row
 * leaves the list. The medrese's own, richer window (nizam/22) is the
 * Medreseler page's; this one has nothing to hand over, because nobody is
 * being replaced.
 */
export function AssignScopeDialog({
  open,
  onOpenChange,
  target,
  onAssigned,
}: Props) {
  const tm = useTranslations("nizam.InactiveAssignDialog");
  const t = tm as unknown as Messages;
  const tp = useTranslations("nizam.InactivePage");
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const [person, setPerson] = useState<PickedUser | null>(null);
  const [end, setEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!open) return;
    setPerson(null);
    setEnd("");
    setNow(new Date());
    setSaving(false);
  }, [open]);

  const type = target?.type ?? "KOSK";
  const { iso: endIso, problem } = resolveEnd({
    value: end,
    held: null,
    timeZone,
    now,
    assignmentEnd: null,
  });

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!target || !person || problem) return;
    setSaving(true);
    const result = await assignScope(
      target.type,
      target.id,
      person.id,
      endIso ? new Date(endIso) : undefined
    );
    setSaving(false);
    if (!result.success) {
      toast.error(t("failed"), {
        description: tp(inactiveErrorKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("saved"), {
      description: t(`savedBody.${type}`, {
        name: target.name,
        person: person.name,
      }),
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
      title={t(`title.${type}`)}
      closeLabel={t("close")}
      footerMeta={t("auditNote")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button
            type="submit"
            loading={saving}
            disabled={!person || problem !== null}
          >
            {t(`submit.${type}`)}
          </Button>
        </>
      }
    >
      <p>{t(`intro.${type}`, { name: target?.name ?? "" })}</p>
      <HeadPicker
        value={person}
        onChange={setPerson}
        disabled={saving}
        label={t(`personLabel.${type}`)}
        chosenTitle={t(`chosenTitle.${type}`)}
        chosenNote={t(`chosenNote.${type}`)}
        name="assigneeEmail"
      />
      <Field
        label={t("endLabel")}
        help={t("endHelp")}
        error={problem ? t("endPast") : undefined}
      >
        <Input
          type="datetime-local"
          name="end"
          value={end}
          disabled={saving}
          onChange={(event) => setEnd(event.target.value)}
        />
      </Field>
    </Dialog>
  );
}
