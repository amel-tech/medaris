"use client";

import { toast } from "@medaris/ui/components/sonner";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useTranslations } from "next-intl";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { openMadrasah } from "../actions";
import {
  canOpen,
  cleanHandle,
  DESCRIPTION_MAX,
  handleError,
  madrasahErrorKey,
  NAME_MAX,
  nameError,
  openPayload,
  type PickedUser,
} from "../present";
import { HeadPicker } from "./head-picker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** called with the new medrese's name once it is saved */
  onOpened?: (name: string) => void;
}

/**
 * "Medrese aç" (nizam 08): a Dialog with a Form — ad, kısa ad, açıklama and
 * the başmüderris found by e-mail. The button stays off until the name, the
 * handle and the başmüderris are right; a handle the server finds taken
 * answers under its own field. The scrim does not close it, so typed input is
 * not lost to a stray click, and a failure keeps it open. The first field has
 * the focus.
 */
export function OpenMadrasahDialog({ open, onOpenChange, onOpened }: Props) {
  const t = useTranslations("nizam.OpenMadrasahDialog");
  const tp = useTranslations("nizam.MadrasahsPage");
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [description, setDescription] = useState("");
  const [head, setHead] = useState<PickedUser | null>(null);
  const [touched, setTouched] = useState({ name: false, handle: false });
  const [taken, setTaken] = useState(false);
  const [saving, setSaving] = useState(false);
  const nameRef = useRef<HTMLElement | null>(null);

  // A new opening starts from a clean form.
  useEffect(() => {
    if (open) {
      setName("");
      setHandle("");
      setDescription("");
      setHead(null);
      setTouched({ name: false, handle: false });
      setTaken(false);
    }
  }, [open]);

  const form = {
    name,
    handle,
    description,
    headMuderrisUserId: head?.id ?? null,
  };
  const nameProblem = nameError(name);
  const handleProblem = handleError(handle);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!canOpen(form)) {
      setTouched({ name: true, handle: true });
      return;
    }
    setSaving(true);
    const result = await openMadrasah(openPayload(form));
    setSaving(false);
    if (!result.success) {
      const key = madrasahErrorKey(result.errorBody);
      if (key === "errors.handleTaken") {
        setTaken(true);
        return;
      }
      toast.error(t("failed"), {
        description: tp(key as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("saved"), {
      description: t("savedBody", {
        name: result.data.name,
        head: head?.name ?? "",
      }),
    });
    onOpened?.(result.data.name);
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
      title={t("title")}
      closeLabel={t("close")}
      initialFocus={nameRef}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button
            type="submit"
            loading={saving}
            disabled={!canOpen(form) || taken}
          >
            {t("submit")}
          </Button>
        </>
      }
    >
      <p>{t("intro")}</p>
      <p className="mds-caption">* {t("requiredNote")}</p>
      <div className="grid gap-4 md:grid-cols-2">
        <Field
          label={t("nameLabel")}
          required
          help={t("nameHelp")}
          error={
            touched.name && nameProblem ? t(`errors.${nameProblem}`) : undefined
          }
        >
          <Input
            {...({ ref: nameRef } as object)}
            name="name"
            value={name}
            maxLength={NAME_MAX}
            required
            disabled={saving}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setTouched((s) => ({ ...s, name: true }))}
          />
        </Field>
        <Field
          label={t("handleLabel")}
          help={t("handleHelp")}
          error={
            taken
              ? t("errors.handleTaken", { handle: cleanHandle(handle) })
              : touched.handle && handleProblem
                ? t(`errors.${handleProblem}`)
                : undefined
          }
        >
          <Input
            name="handle"
            mono
            autoComplete="off"
            spellCheck={false}
            leading={<span aria-hidden="true">@</span>}
            value={handle}
            disabled={saving}
            onChange={(e) => {
              setHandle(e.target.value);
              setTaken(false);
            }}
            onBlur={() => setTouched((s) => ({ ...s, handle: true }))}
          />
        </Field>
      </div>
      <Field label={t("descriptionLabel")} help={t("descriptionHelp")}>
        <Textarea
          name="description"
          value={description}
          maxLength={DESCRIPTION_MAX}
          rows={4}
          disabled={saving}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>
      <HeadPicker
        value={head}
        onChange={setHead}
        disabled={saving}
        chosenNote={t("chosenNote")}
      />
    </Dialog>
  );
}
