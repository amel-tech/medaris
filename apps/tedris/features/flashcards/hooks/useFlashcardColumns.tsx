"use client";

import { TrashIcon } from "@medaris/icons";
import type { FlashcardResponse } from "@medaris/services/tedrisat";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@medaris/ui/components/alert-dialog";
import { Button } from "@medaris/ui/components/button";
import type { LegacyColumnDef as ColumnDef } from "@tanstack/react-table/legacy";
import { useTranslations } from "next-intl";
import React from "react";
import { createInputColumn } from "~/components/data-table/editable";

export function useFlashcardColumns() {
  const t = useTranslations("tedris");

  return React.useMemo<ColumnDef<FlashcardResponse>[]>(
    () => [
      createInputColumn(
        "contentFront",
        { header: t("DeckCards.frontFace") },
        {
          placeholder: t("DeckCards.frontPlaceholder"),
          className: "font-medium",
        }
      ),
      createInputColumn(
        "contentBack",
        { header: t("DeckCards.backFace") },
        {
          placeholder: t("DeckCards.backPlaceholder"),
          className: "font-medium",
        }
      ),
      {
        id: "actions",
        size: 10,
        cell: ({ row, table }) => (
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline">
                <TrashIcon size={16} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t("DeckCards.deleteConfirmTitle")}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t("DeckCards.deleteConfirmDescription")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t("DeckCards.cancel")}</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    table.options.meta?.onRowDelete?.(row.original.id)
                  }
                >
                  {t("DeckCards.delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    [t]
  );
}
