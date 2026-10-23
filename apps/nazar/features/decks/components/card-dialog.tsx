"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { Field } from "@medaris/ui/mds/field";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { createCard, updateCard } from "../actions";
import {
  type CardDraft,
  type CardFact,
  type CardField,
  type CardType,
  cardBody,
  cardDraftOf,
  cardProblems,
  deckErrorKey,
  FACE_MAX,
  FACE_MIN,
  newCardDraft,
} from "../decks";

/**
 * "Kart ekle" and "Kartı düzenle". The front face is Arabic and is set in RTL;
 * both faces are 3 to 5000 characters. A card is sent with its deck's type.
 */
export function CardDialog({
  deckId,
  cardType,
  card,
  onClose,
}: {
  deckId: string;
  cardType: CardType;
  /** the card being edited; absent for a new one */
  card?: CardFact;
  onClose: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<CardDraft>(() =>
    card ? cardDraftOf(card) : newCardDraft(cardType)
  );
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const problems = cardProblems(draft);

  const faceError = (field: CardField): string | undefined => {
    if (!sent) return undefined;
    const problem = problems[field];
    if (problem === "required") return words("Decks.required");
    if (problem === "length")
      return words("Decks.lengthError", { min: FACE_MIN, max: FACE_MAX });
    return undefined;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSent(true);
    setFailure(null);
    if (Object.keys(problems).length > 0) return;
    const body = cardBody({ ...draft, type: cardType });
    startTransition(async () => {
      const outcome = card
        ? await updateCard(card.id, body)
        : await createCard(deckId, body);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      notify({
        tone: "success",
        title: words(card ? "Decks.cardSaved" : "Decks.cardAdded"),
      });
      onClose();
      router.refresh();
    });
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
      title={words(card ? "Decks.editCardTitle" : "Decks.addCardTitle")}
      footer={
        <>
          <DialogClose>{words("Decks.cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {words("Decks.save")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label={words("Decks.front")}
          error={faceError("contentFront")}
          required
        >
          <Textarea
            name="contentFront"
            lang="ar"
            dir="rtl"
            value={draft.contentFront}
            onChange={(event) =>
              setDraft({ ...draft, contentFront: event.target.value })
            }
          />
        </Field>
        <Field
          label={words("Decks.back")}
          error={faceError("contentBack")}
          required
        >
          <Textarea
            name="contentBack"
            value={draft.contentBack}
            onChange={(event) =>
              setDraft({ ...draft, contentBack: event.target.value })
            }
          />
        </Field>
        {failure ? <Alert tone="error">{failure}</Alert> : null}
      </div>
    </Dialog>
  );
}
