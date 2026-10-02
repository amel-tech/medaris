"use client";

import type { FlashcardDeckResponse } from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, type RefObject, useState } from "react";
import { updateDeck } from "../actions";
import { attempt } from "../attempt";
import {
  DESCRIPTION_MAX,
  TITLE_MAX,
  TITLE_MIN,
  titleProblem,
  unchanged,
} from "../deck-model";

const TITLE_ID = "deck-edit-title";

/** The title box, found when the dialog opens: the form's first field takes the focus (canvas rule 13). */
const firstField = {
  get current() {
    return document.getElementById(TITLE_ID);
  },
} as RefObject<HTMLElement | null>;

/**
 * Desteyi düzenle (design tedris/33): the name and the description, over the
 * deck's page. Opened by the route `/decks/[id]/edit`, closed by going back to
 * `/decks/[id]`, so the address says what is on screen. A pending publication
 * request is not touched by an edit; the dialog says so. Nothing is sent when
 * nothing changed.
 */
export function DeckEditDialog({
  deck,
  open,
}: {
  deck: FlashcardDeckResponse;
  open: boolean;
}) {
  const t = useTranslations("tedris.Decks");
  const router = useRouter();
  const toaster = useToaster();
  const [title, setTitle] = useState(deck.title);
  const [description, setDescription] = useState(deck.description ?? "");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const close = () => router.replace(`/decks/${deck.id}`);

  const problem = titleProblem(title);
  const titleError = !attempted
    ? undefined
    : problem === "required"
      ? t("nameRequired")
      : problem === "tooShort"
        ? t("nameTooShort", { min: TITLE_MIN })
        : undefined;

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (problem !== null) return;
    if (unchanged(deck, { title, description })) {
      close();
      return;
    }
    setBusy(true);
    const result = await attempt(() =>
      updateDeck(deck.id, { title, description })
    );
    setBusy(false);
    if (!result.success) {
      toaster.notify({
        tone: "error",
        title: t("saveFailedTitle"),
        description: t("tryAgainKept"),
      });
      return;
    }
    toaster.notify({ tone: "success", title: t("savedTitle") });
    router.replace(`/decks/${deck.id}`);
    router.refresh();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close();
      }}
      form
      onSubmit={submit}
      size="md"
      eyebrow={<span dir="auto">{deck.title}</span>}
      title={t("editTitle")}
      initialFocus={firstField}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          <Button type="submit" loading={busy}>
            {t("save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <p className="mds-caption">{t("required")}</p>
        <Field
          label={t("nameLabel")}
          help={t("nameHelp")}
          error={titleError}
          required
        >
          <Input
            id={TITLE_ID}
            name="title"
            value={title}
            maxLength={TITLE_MAX}
            autoComplete="off"
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label={t("descriptionLabel")} help={t("descriptionHelp")}>
          <Textarea
            name="description"
            rows={3}
            maxLength={DESCRIPTION_MAX}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        {deck.publishStatus === "PENDING" ? (
          <Alert tone="neutral" title={t("pendingTitle")}>
            {t("pendingText")}
          </Alert>
        ) : null}
      </div>
    </Dialog>
  );
}
