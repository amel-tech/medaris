import type { FlashcardDeckSummaryResponse } from "@medaris/services/tedrisat";
import { Badge } from "@medaris/ui/mds/badge";
import { Icon } from "@medaris/ui/mds/icon";
import type { CardStatus, DeckStatus } from "../deck-model";

type Kind = NonNullable<FlashcardDeckSummaryResponse["collectionKind"]>;

/**
 * The badges the deck screens share. They take their words as a prop: each page
 * owns its message namespace, and a badge that picked the namespace itself
 * would make the type checker work through a union of them on every render.
 */

/**
 * A deck's publishing status as the design draws it (tedris/25, 28): the
 * clock for a request that waits, the padlock for a private deck, plain words
 * for one that is public.
 */
export function StatusBadge({
  status,
  label,
}: {
  status: DeckStatus;
  label: string;
}) {
  return (
    <Badge
      variant={status === "PENDING" ? "warning" : "secondary"}
      icon={
        status === "PENDING" ? (
          <Icon name="clock" size="sm" />
        ) : status === "PRIVATE" ? (
          <Icon name="lock" size="sm" />
        ) : undefined
      }
    >
      {label}
    </Badge>
  );
}

const KIND_ICONS = {
  COURSE: "book",
  KOSK: "kosk",
  MADRASAH: "medrese",
} as const;

/** Where a deck of somebody else's comes from: a course, a köşk, a medrese, or everyone. */
export function KindBadge({ kind, label }: { kind: Kind; label: string }) {
  if (kind === "PUBLIC") return <Badge variant="outline">{label}</Badge>;
  return (
    <Badge
      variant="secondary"
      icon={<Icon name={KIND_ICONS[kind]} size="sm" />}
    >
      {label}
    </Badge>
  );
}

const CARD_STATUS_VARIANTS = {
  NEW: "info",
  LEARNING: "warning",
  MASTERED: "success",
} as const;

/** A card's status for the caller. */
export function CardStatusBadge({
  status,
  label,
}: {
  status: CardStatus;
  label: string;
}) {
  return <Badge variant={CARD_STATUS_VARIANTS[status]}>{label}</Badge>;
}
