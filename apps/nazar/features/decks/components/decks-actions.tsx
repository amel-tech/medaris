"use client";

import { Button } from "@medaris/ui/mds/button";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import type { WeekOption } from "../decks";
import { DeckFormDialog } from "./deck-form-dialog";
import { ImportCardsDialog } from "./import-cards-dialog";

/** "Excel'den aktar" (secondary) and "Deste aç" (primary) of the deck list, and their dialogs. */
export function DecksActions({
  courseId,
  decks,
  weeks,
}: {
  courseId: string;
  decks: { id: string; title: string }[];
  weeks: WeekOption[];
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const [open, setOpen] = useState<null | "new" | "import">(null);

  return (
    <>
      <div className="flex flex-wrap gap-3">
        <Button
          variant="secondary"
          disabled={decks.length === 0}
          onClick={() => setOpen("import")}
        >
          {words("Decks.importButton")}
        </Button>
        <Button onClick={() => setOpen("new")}>
          {words("Decks.newButton")}
        </Button>
      </div>
      {open === "new" ? (
        <DeckFormDialog
          courseId={courseId}
          weeks={weeks}
          onClose={() => setOpen(null)}
        />
      ) : null}
      {open === "import" ? (
        <ImportCardsDialog decks={decks} onClose={() => setOpen(null)} />
      ) : null}
    </>
  );
}
