"use client";

import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { PlatformChip } from "@medaris/ui/mds/platform-chip";
import { Switch } from "@medaris/ui/mds/switch";
import { useToaster } from "@medaris/ui/mds/toast";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { addRecording, changeRecording } from "../actions";
import {
  chipOf,
  createBody,
  formErrors,
  formOf,
  newForm,
  patchBody,
  providerOfLink,
  type RecordingFact,
  recordingErrorKey,
  recordingsMoved,
  type SessionSlot,
  switchLocked,
} from "../recordings";

/**
 * "Kayıt ekle" and "Düzenle": a pasted link with a title and who may watch it.
 * The provider chip appears as the link is typed. "Herkese açık" starts off;
 * YouTube is for public recordings only, so a YouTube link with the switch off
 * is stopped here with one line (the API refuses it too), a YouTube recording
 * that is public keeps the switch on, and a closed course opens nothing to
 * everyone. Editing sends only what changed. A refusal is worded from the
 * API's code; when it means the page is out of date, the dialog closes and the
 * page is read again.
 */
export function RecordingDialog({
  slot,
  closed,
  onClose,
  onDone,
}: {
  slot: SessionSlot;
  /** the course is closed: nothing is opened to everyone */
  closed: boolean;
  onClose: () => void;
  /** called once something was written, or the page is out of date, for it to be read again */
  onDone: () => void;
}) {
  const t = useTranslations("nazir");
  const words = t as unknown as Messages;
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const editing: RecordingFact | null = slot.recording;
  const [form, setForm] = useState(() =>
    editing ? formOf(editing) : newForm(slot.title, t("Recordings.titleSuffix"))
  );
  const [sent, setSent] = useState(false);

  const errors = formErrors(form);
  const provider = providerOfLink(form.url);
  const chip = chipOf(provider);
  const lock = switchLocked(form, closed);
  const showError = (problem: keyof typeof errors) =>
    // YouTube with the switch off is known the moment the link is typed.
    problem === "youtubePublic" || sent ? errors[problem] === true : false;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (Object.keys(errors).length > 0) {
      setSent(true);
      return;
    }
    const patch = editing ? patchBody(form, editing) : null;
    const create = editing ? null : createBody(form);
    if (!patch && !create) {
      // nothing changed
      onClose();
      return;
    }
    startTransition(async () => {
      const result =
        editing && patch
          ? await changeRecording(editing.id, patch)
          : create
            ? await addRecording(slot.lessonId, create)
            : null;
      if (!result) return;
      if (!result.success) {
        notify({
          tone: "error",
          title: t("Recordings.failed"),
          description: words(recordingErrorKey(result.code)),
        });
        if (recordingsMoved(result.code)) {
          onClose();
          onDone();
        }
        return;
      }
      notify(
        editing
          ? {
              title: t("Recordings.saved"),
              description: t("Recordings.savedBody", {
                title: form.title.trim(),
              }),
            }
          : {
              title: t("Recordings.added"),
              description: t("Recordings.addedBody", { session: slot.title }),
            }
      );
      onClose();
      onDone();
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      form
      onSubmit={submit}
      eyebrow={slot.title}
      title={t(
        editing ? "Recordings.form.editTitle" : "Recordings.form.addTitle"
      )}
      closeLabel={t("Shell.close")}
      footer={
        <>
          <DialogClose>{t("Recordings.form.cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {t(
              editing
                ? "Recordings.form.submitEdit"
                : "Recordings.form.submitAdd"
            )}
          </Button>
        </>
      }
    >
      <Field
        label={t("Recordings.form.titleLabel")}
        required
        error={
          showError("title") ? t("Recordings.form.errors.title") : undefined
        }
      >
        <Input
          name="title"
          value={form.title}
          maxLength={200}
          disabled={pending}
          onChange={(event) => setForm({ ...form, title: event.target.value })}
        />
      </Field>
      <Field
        label={
          <span className="flex w-full items-center justify-between gap-2">
            {t("Recordings.form.linkLabel")}
            {chip ? (
              <PlatformChip
                platform={chip}
                kind="recording"
                detected
                detectedLabel={t("Recordings.form.detected")}
              />
            ) : null}
          </span>
        }
        required
        help={t("Recordings.form.linkHelp")}
        error={
          showError("linkEmpty")
            ? t("Recordings.form.errors.linkEmpty")
            : showError("link")
              ? t("Recordings.form.errors.link")
              : showError("youtubePublic")
                ? t("Recordings.form.youtubePublic")
                : undefined
        }
      >
        <Input
          mono
          name="url"
          placeholder="https://…"
          autoComplete="off"
          spellCheck={false}
          value={form.url}
          disabled={pending}
          onChange={(event) => setForm({ ...form, url: event.target.value })}
        />
      </Field>
      <Switch
        label={t("Recordings.form.publicLabel")}
        description={
          lock.reason === "youtube"
            ? t("Recordings.form.youtubePublic")
            : lock.reason === "closed"
              ? t("Recordings.form.closed")
              : t("Recordings.form.publicHelp")
        }
        checked={form.isPublic}
        disabled={pending || lock.locked}
        onCheckedChange={(checked) => setForm({ ...form, isPublic: checked })}
      />
    </Dialog>
  );
}
