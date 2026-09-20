"use client";

import type { FlashcardResponse } from "@medaris/services/tedrisat";
import { toastHelper } from "@medaris/ui/lib/toast-helper";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { DataTable } from "~/components/data-table";
import { createDefaultColumn } from "~/components/data-table/editable";
import {
  deleteFlashcard,
  updateFlashcard,
} from "~/features/flashcards/actions";
import { useFlashcardColumns } from "~/features/flashcards/hooks/useFlashcardColumns";
import AddCardButtonDialog from "./deckform/add-card-button-dialog";

export function DeckCardsTable({
  deckId,
  flashcards,
  isOwner,
}: {
  deckId: string;
  flashcards: FlashcardResponse[] | undefined;
  /**
   * Display only — the API re-derives the caller from the token it verifies
   * itself. It exists so a visitor browsing somebody else's public deck is not
   * offered controls that answer 403 (MDRS-63 closed the card write routes).
   */
  isOwner: boolean;
}) {
  const t = useTranslations("tedris");
  const columns = useFlashcardColumns(isOwner);

  const onRowUpdate = async (updatedRow: FlashcardResponse) => {
    const result = await updateFlashcard(updatedRow.id, {
      contentFront: updatedRow.contentFront,
      contentBack: updatedRow.contentBack,
    });
    if (result.success) {
      toastHelper.success({
        title: t("DeckCards.cardUpdated"),
        description: t("DeckCards.cardUpdatedDescription"),
      });
      return true;
    } else {
      toastHelper.error({
        title: t("DeckCards.updateError"),
        description: t("DeckCards.updateErrorDescription"),
      });
    }
    return false;
  };

  const onRowDelete = async (id: string) => {
    const result = await deleteFlashcard(id);
    if (result.success) {
      toastHelper.success(
        {
          title: t("DeckCards.cardDeleted"),
          description: t("DeckCards.cardDeletedDescription", { id }),
        },
        { cardId: id }
      );
      return true;
    } else {
      toastHelper.error({
        title: t("DeckCards.deleteError"),
        description: t("DeckCards.deleteErrorDescription"),
      });
    }
    return false;
  };

  const defaultColumn = useMemo(() => {
    return createDefaultColumn<FlashcardResponse>();
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h4>{t("DeckCards.cards")}</h4>
        {isOwner && <AddCardButtonDialog deckId={deckId} />}
      </div>
      <DataTable
        columns={columns}
        data={flashcards || []}
        onRowUpdate={isOwner ? onRowUpdate : undefined}
        defaultColumn={defaultColumn}
        onRowDelete={isOwner ? onRowDelete : undefined}
      />
    </div>
  );
}
