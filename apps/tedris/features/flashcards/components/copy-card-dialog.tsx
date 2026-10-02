"use client";

import type {
  CreateFlashcardDtoTypeEnum,
  FlashcardDeckSummaryResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/mds/button";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
import { RadioGroup } from "@medaris/ui/mds/radio-group";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState } from "react";
import { copyCard } from "../actions";
import { attempt } from "../attempt";

/**
 * "Kendi desteme kopyala" (design tedris/31): a card of somebody else's deck
 * goes, as it is, into one of the caller's own decks of the same kind. The
 * design draws no picker, so this is one small dialog with a radio list (a
 * select's list would open behind the dialog's scrim); the source
 * deck is not touched. Without a deck of that kind to copy into it says so and
 * points at "Deste oluştur".
 */
export function CopyCardDialog({
  card,
  cardNumber,
  ownDecks,
  onClose,
}: {
  card: FlashcardResponse;
  cardNumber: number;
  /** the caller's own decks of the card's kind */
  ownDecks: FlashcardDeckSummaryResponse[];
  onClose: () => void;
}) {
  const t = useTranslations("tedris.Decks");
  const router = useRouter();
  const toaster = useToaster();
  // No default: copying is the caller's explicit choice of where the card goes.
  const [target, setTarget] = useState<string | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setAttempted(true);
    const deck = ownDecks.find((d) => d.id === target);
    if (!deck) return;
    setBusy(true);
    const result = await attempt(() =>
      copyCard(deck.id, {
        type: card.type as CreateFlashcardDtoTypeEnum,
        contentFront: card.contentFront,
        contentBack: card.contentBack,
        contentMeta: card.contentMeta,
      })
    );
    setBusy(false);
    if (!result.success) {
      toaster.notify({
        tone: "error",
        title: t("copyFailedTitle"),
        description: t("tryAgain"),
      });
      return;
    }
    toaster.notify({
      tone: "success",
      title: t("copiedTitle"),
      description: t("copiedText", { deck: deck.title }),
    });
    router.refresh();
    onClose();
  };

  const none = ownDecks.length === 0;
  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      form
      onSubmit={submit}
      eyebrow={t("cardN", { n: cardNumber })}
      title={t("copy")}
      footer={
        <>
          <DialogClose>{t("cancel")}</DialogClose>
          {none ? (
            <Button href="/decks/create">{t("create")}</Button>
          ) : (
            <Button type="submit" loading={busy}>
              {t("copySubmit")}
            </Button>
          )}
        </>
      }
    >
      {none ? (
        <p>{t("noOwnDecks")}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p>{t("copyHelp")}</p>
          <div className="flex flex-col gap-2">
            <RadioGroup
              legend={
                <>
                  {t("targetLabel")}
                  <span className="mds-required" aria-hidden="true">
                    *
                  </span>
                </>
              }
              bordered
              required
              value={target}
              onChange={setTarget}
              options={ownDecks.map((d) => ({ value: d.id, label: d.title }))}
            />
            {attempted && !target ? (
              <p className="mds-error" role="alert">
                {t("targetRequired")}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </Dialog>
  );
}
