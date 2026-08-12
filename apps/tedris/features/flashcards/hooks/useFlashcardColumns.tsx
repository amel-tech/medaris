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
import type { ColumnDef } from "@tanstack/react-table";
import React from "react";
import { createInputColumn } from "~/components/data-table/editable";

export function useFlashcardColumns() {
  return React.useMemo<ColumnDef<FlashcardResponse>[]>(
    () => [
      createInputColumn(
        "contentFront",
        { header: "Front Face" },
        {
          placeholder: "Enter front content...",
          className: "font-medium",
        }
      ),
      createInputColumn(
        "contentBack",
        { header: "Back Face" },
        {
          placeholder: "Enter back content...",
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
                <AlertDialogTitle>Emin misin?</AlertDialogTitle>
                <AlertDialogDescription>
                  Bu kart ve karta kayıtlı bilgileriniz silinecek. Bu işlem geri
                  alınamaz.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>İptal</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() =>
                    table.options.meta?.onRowDelete?.(row.original.id)
                  }
                >
                  Sil
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        ),
        enableSorting: false,
        enableColumnFilter: false,
      },
    ],
    []
  );
}
