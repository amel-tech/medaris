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
import { CardQuickAdd } from "./card-quick-add";
import { CardTile } from "./card-tile";
import { DeckSettings } from "./deck-settings";
import { ImportCardsDialog } from "./import-cards-dialog";
import { SigaGeneratorDialog } from "./siga-generator-dialog";

/**
 * A deck's body: "Sîga üret" and "Excel'den aktar", the inline "Kart ekle"
 * row, the cards as a compact grid with each card's "Düzenle" (in place) and
 * "Sil", then the deck's settings. The front face is set in Arabic and RTL.
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
  const [dialog, setDialog] = useState<null | "import" | "siga">(null);
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
            <Button variant="secondary" onClick={() => setDialog("siga")}>
              {words("Decks.siga.button")}
            </Button>
            <Button variant="secondary" onClick={() => setDialog("import")}>
              {words("Decks.importButton")}
            </Button>
          </div>
        </div>
        <CardQuickAdd deckId={deck.id} cardType={deck.cardType} />
        {failure ? <p className="mds-body-sm">{failure}</p> : null}
        {cards.length === 0 ? (
          <EmptyState>{words("Decks.cardsEmpty")}</EmptyState>
        ) : (
          <ul className="m-0 grid list-none gap-2 p-0 [grid-template-columns:repeat(auto-fill,minmax(10rem,1fr))]">
            {cards.map((card) => (
              <li key={card.id}>
                <CardTile
                  card={card}
                  busy={pending}
                  onRemove={() => setRemoving(card)}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <DeckSettings courseId={courseId} deck={deck} weeks={weeks} />

      {dialog === "siga" ? (
        <SigaGeneratorDialog
          deckId={deck.id}
          cardType={deck.cardType}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog === "import" ? (
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
