"use client";

import type {
  FlashcardResponse,
  FlashcardType,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, type RefObject, useState } from "react";
import { createCard, updateCard } from "../actions";
import { FACE_MAX, FACE_MIN, faceProblem, isArabic } from "../deck-model";

const FRONT_ID = "card-form-front";

const firstField = {
  get current() {
    return document.getElementById(FRONT_ID);
  },
} as RefObject<HTMLElement | null>;

/**
 * "Kart ekle" and "Düzenle" on the card list (design tedris/29): the two faces
 * of one card in a form dialog. Adding takes the deck's kind; editing takes the
 * card. Both faces must hold at least three characters, which is what the API
 * takes, and are said so on the field. A refusal keeps what was typed.
 */
export function CardFormDialog({
  deckId,
  kind,
  card,
  onClose,
}: {
  deckId: string;
  kind: FlashcardType;
  /** the card being edited; absent when adding */
  card?: FlashcardResponse;
  onClose: () => void;
}) {
  const t = useTranslations("tedris.Decks");
  const router = useRouter();
  const toaster = useToaster();
  const [front, setFront] = useState(card?.contentFront ?? "");
  const [back, setBack] = useState(card?.contentBack ?? "");
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const message = (text: string) => {
    const problem = faceProblem(text);
    if (!attempted || problem === null) return undefined;
    return problem === "required"
      ? t("fieldRequired")
      : t("fieldTooShort", { min: FACE_MIN });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    if (faceProblem(front) !== null || faceProblem(back) !== null) return;
    setBusy(true);
    const fields = { contentFront: front, contentBack: back };
    const result = card
      ? await updateCard(card.id, fields)
      : await createCard(deckId, kind, fields);
    setBusy(false);
    if (!result.success) {
      toaster.notify({
        tone: "error",
        title: t("saveFailedTitle"),
        description: t("tryAgainKept"),
      });
      return;
    }
    toaster.notify({
      tone: "success",
      title: t(card ? "cardUpdatedTitle" : "cardAddedTitle"),
    });
    router.refresh();
    onClose();
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      form
      onSubmit={submit}
      size="md"
      title={card ? t("editCardTitle") : t("addCard")}
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
          label={t("frontLabel")}
          help={
            kind === "HADEETH"
              ? t("frontHelpHADEETH")
              : t("frontHelpVOCABULARY")
          }
          error={message(front)}
          required
        >
          <Textarea
            id={FRONT_ID}
            name="contentFront"
            rows={3}
            maxLength={FACE_MAX}
            value={front}
            dir={isArabic(front) ? "rtl" : "auto"}
            onChange={(event) => setFront(event.target.value)}
          />
        </Field>
        <Field
          label={t("backLabel")}
          help={
            kind === "HADEETH" ? t("backHelpHADEETH") : t("backHelpVOCABULARY")
          }
          error={message(back)}
          required
        >
          <Textarea
            name="contentBack"
            rows={4}
            maxLength={FACE_MAX}
            value={back}
            onChange={(event) => setBack(event.target.value)}
          />
        </Field>
      </div>
    </Dialog>
  );
}
