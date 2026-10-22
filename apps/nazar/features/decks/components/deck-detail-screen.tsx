"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { deleteCard } from "../actions";
import type { CardFact, DeckFact, WeekOption } from "../decks";
import { CardDialog } from "./card-dialog";
import { DeckSettings } from "./deck-settings";
import { ImportCardsDialog } from "./import-cards-dialog";

/**
 * A deck's body: its cards with "Kart ekle", "Excel'den aktar", and each
 * card's "Düzenle" and "Sil", then the deck's settings. The front face is set
 * in Arabic and RTL.
 */
export function DeckDetailScreen({
  courseId,
  deck,
  cards,
  weeks,
}: {
  courseId: string;
  deck: DeckFact;
  cards: CardFact[];
  weeks: WeekOption[];
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<
    | null
    | { kind: "new" }
    | { kind: "edit"; card: CardFact }
    | { kind: "import" }
  >(null);
  const [removing, setRemoving] = useState<CardFact | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const remove = (card: CardFact) => {
    setRemoving(null);
    setFailure(null);
    startTransition(async () => {
      const outcome = await deleteCard(card.id);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words("Decks.failed"));
        return;
      }
      notify({ tone: "success", title: words("Decks.cardRemoved") });
      router.refresh();
    });
  };

  return (
    <>
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="mds-h2">
            {words("Decks.cardsTitle")} · {cards.length}
          </h2>
          <div className="flex flex-wrap gap-3">
            <Button
              variant="secondary"
              onClick={() => setDialog({ kind: "import" })}
            >
              {words("Decks.importButton")}
            </Button>
            <Button onClick={() => setDialog({ kind: "new" })}>
              {words("Decks.addCard")}
            </Button>
          </div>
        </div>
        {failure ? <p className="mds-body-sm">{failure}</p> : null}
        {cards.length === 0 ? (
          <EmptyState>{words("Decks.cardsEmpty")}</EmptyState>
        ) : (
          <ul className="flex flex-col divide-y divide-neutral-muted">
            {cards.map((card) => (
              <li
                key={card.id}
                className="flex flex-wrap items-start justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="mds-body" lang="ar" dir="rtl">
                    {card.contentFront}
                  </span>
                  <span className="mds-body-sm text-neutral-muted">
                    {card.contentBack}
                  </span>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={pending}
                    onClick={() => setDialog({ kind: "edit", card })}
                  >
                    {words("Decks.edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    disabled={pending}
                    onClick={() => setRemoving(card)}
                  >
                    {words("Decks.remove")}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeckSettings courseId={courseId} deck={deck} weeks={weeks} />

      {dialog?.kind === "new" ? (
        <CardDialog
          deckId={deck.id}
          cardType={deck.cardType}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "edit" ? (
        <CardDialog
          deckId={deck.id}
          cardType={deck.cardType}
          card={dialog.card}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === "import" ? (
        <ImportCardsDialog
          decks={[{ id: deck.id, title: deck.title }]}
          deckId={deck.id}
          onClose={() => setDialog(null)}
        />
      ) : null}
      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
        title={words("Decks.remove")}
        confirmLabel={words("Decks.removeYes")}
        confirmVariant="destructive"
        onConfirm={() => removing && remove(removing)}
      >
        {words("Decks.removeConfirm")}
      </AlertDialog>
    </>
  );
}
