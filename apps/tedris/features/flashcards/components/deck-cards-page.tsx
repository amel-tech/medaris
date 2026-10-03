"use client";

import type {
  FlashcardDeckResponse,
  FlashcardResponse,
} from "@medaris/services/tedrisat";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Table } from "@medaris/ui/mds/table";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { deleteCard } from "../actions";
import { attempt } from "../attempt";
import { cardStatus, kindOf } from "../deck-model";
import { CardFace } from "./card-face";
import { CardFormDialog } from "./card-form-dialog";
import { CardStatusBadge } from "./deck-badges";
import { DeckHeader } from "./deck-header";
import { ImportCardsDialog } from "./import-cards-dialog";

type Dialogs =
  | { kind: "add" }
  | { kind: "import" }
  | { kind: "edit"; card: FlashcardResponse }
  | { kind: "delete"; card: FlashcardResponse; n: number };

/**
 * Kartlar (design tedris/29): every card of the author's deck with its two
 * faces and the author's own status, "Dışa aktar", "İçe aktar" and "Kart
 * ekle", and "Düzenle" and "Sil" on each row. A card is deleted only after an
 * answer to a confirmation. The page is the author's; anybody else is sent to
 * the forbidden page before this renders, and the API answers 403 to a write
 * regardless.
 */
export function DeckCardsPage({
  deck,
  cards,
}: {
  deck: FlashcardDeckResponse;
  cards: FlashcardResponse[];
}) {
  const t = useTranslations("tedris.Decks");
  const router = useRouter();
  const toaster = useToaster();
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  const [deleting, setDeleting] = useState(false);
  const kind = kindOf(deck);

  const close = () => setDialog(null);

  const remove = async (card: FlashcardResponse) => {
    if (deleting) return;
    setDeleting(true);
    const result = await attempt(() => deleteCard(card.id));
    setDeleting(false);
    if (!result.success) {
      close();
      toaster.notify({
        tone: "error",
        title: t("deleteFailedTitle"),
        description: t("tryAgain"),
      });
      return;
    }
    toaster.notify({ tone: "success", title: t("cardDeletedTitle") });
    router.refresh();
    close();
  };

  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      <DeckHeader
        deck={deck}
        isOwner
        cardCount={cards.length}
        tab="cards"
        actions={
          <>
            <Button
              href={`/api/decks/${deck.id}/export?format=xlsx`}
              variant="outline"
              download
              iconLeft={<Icon name="download" />}
            >
              {t("export")}
            </Button>
            <Button
              variant="outline"
              iconLeft={<Icon name="upload" />}
              onClick={() => setDialog({ kind: "import" })}
            >
              {t("import")}
            </Button>
            <Button
              iconLeft={<Icon name="plus" />}
              onClick={() => setDialog({ kind: "add" })}
            >
              {t("addCard")}
            </Button>
          </>
        }
      />

      <p className="mds-caption max-inline-measure">{t("cardsNote")}</p>

      {cards.length === 0 ? (
        <EmptyState
          icon={<Icon name="cards" size="lg" />}
          action={
            <Button
              iconLeft={<Icon name="plus" />}
              onClick={() => setDialog({ kind: "add" })}
            >
              {t("addCard")}
            </Button>
          }
        >
          {t("emptyCards")}
        </EmptyState>
      ) : (
        <Table
          caption={t("tableCaption", { title: deck.title })}
          responsive="stack"
          rows={cards}
          rowKey={(card) => card.id}
          columns={[
            {
              key: "front",
              header: t("frontLabel"),
              rowHeader: true,
              render: (card) => <CardFace text={card.contentFront} />,
            },
            {
              key: "back",
              header: t("backLabel"),
              render: (card) => (
                <span className="block" dir="auto">
                  {card.contentBack}
                </span>
              ),
            },
            {
              key: "status",
              header: t("statusCol"),
              render: (card) => (
                <CardStatusBadge
                  status={cardStatus(card)}
                  label={
                    cardStatus(card) === "MASTERED"
                      ? t("statusMASTERED")
                      : cardStatus(card) === "LEARNING"
                        ? t("statusLEARNING")
                        : t("statusNEW")
                  }
                />
              ),
            },
            {
              key: "actions",
              header: (
                <span className="mds-visually-hidden">{t("actionsCol")}</span>
              ),
              align: "right",
              render: (card, index) => (
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="small"
                    iconLeft={<Icon name="edit" />}
                    aria-label={t("editLabel", { n: index + 1 })}
                    onClick={() => setDialog({ kind: "edit", card })}
                  >
                    {t("edit")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    iconLeft={<Icon name="trash" />}
                    aria-label={t("deleteLabel", { n: index + 1 })}
                    onClick={() =>
                      setDialog({ kind: "delete", card, n: index + 1 })
                    }
                  >
                    {t("deleteShort")}
                  </Button>
                </span>
              ),
            },
          ]}
        />
      )}

      {dialog?.kind === "add" ? (
        <CardFormDialog deckId={deck.id} kind={kind} onClose={close} />
      ) : null}
      {dialog?.kind === "edit" ? (
        <CardFormDialog
          deckId={deck.id}
          kind={kind}
          card={dialog.card}
          onClose={close}
        />
      ) : null}
      {dialog?.kind === "import" ? (
        <ImportCardsDialog deckId={deck.id} onClose={close} />
      ) : null}
      {dialog?.kind === "delete" ? (
        <AlertDialog
          open
          onOpenChange={(next) => {
            if (!next) close();
          }}
          eyebrow={t("cardN", { n: dialog.n })}
          title={t("cardDeleteTitle")}
          confirmLabel={t("cardDeleteConfirm")}
          confirmVariant="destructive"
          confirmLoading={deleting}
          onConfirm={() => remove(dialog.card)}
        >
          {t("cardDeleteText")}
        </AlertDialog>
      ) : null}
    </main>
  );
}
