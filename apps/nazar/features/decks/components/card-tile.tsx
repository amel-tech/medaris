"use client";

import { Icon } from "@medaris/ui/mds/icon";
import { IconButton } from "@medaris/ui/mds/icon-button";
import { Input } from "@medaris/ui/mds/input";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { updateCard } from "../actions";
import {
  type CardDraft,
  type CardFact,
  cardBody,
  cardDraftOf,
  cardProblems,
  deckErrorKey,
  FACE_MAX,
  FACE_MIN,
} from "../decks";

/**
 * One card in the deck page's grid, small enough that a whole emsile deck
 * (two dozen sîgas) fits on one screen: the Arabic front, the back under it,
 * and "Düzenle" and "Sil" as icons. "Düzenle" turns the tile into the two
 * faces in place; Enter saves, Escape leaves them as they were.
 */
export function CardTile({
  card,
  busy,
  onRemove,
}: {
  card: CardFact;
  /** another write on the page is running */
  busy: boolean;
  onRemove: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<CardDraft | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!draft || pending) return;
    if (Object.keys(cardProblems(draft)).length > 0) {
      setFailure(words("Decks.lengthError", { min: FACE_MIN, max: FACE_MAX }));
      return;
    }
    setFailure(null);
    startTransition(async () => {
      const outcome = await updateCard(card.id, cardBody(draft));
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      setDraft(null);
      router.refresh();
    });
  };

  if (draft) {
    return (
      <form
        onSubmit={save}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setDraft(null);
            setFailure(null);
          }
        }}
        aria-label={words("Decks.editCardTitle")}
        className="flex flex-col gap-1 rounded-md border border-neutral-subtle bg-neutral-surface p-2"
      >
        <Input
          size="small"
          name="contentFront"
          lang="ar"
          dir="rtl"
          autoFocus
          aria-label={words("Decks.front")}
          value={draft.contentFront}
          onChange={(event) =>
            setDraft({ ...draft, contentFront: event.target.value })
          }
        />
        <Input
          size="small"
          name="contentBack"
          aria-label={words("Decks.back")}
          value={draft.contentBack}
          onChange={(event) =>
            setDraft({ ...draft, contentBack: event.target.value })
          }
        />
        {failure ? <span className="mds-body-sm">{failure}</span> : null}
        <div className="flex justify-end gap-1">
          <IconButton
            size="mini"
            label={words("Decks.cancel")}
            icon={<Icon name="close" size="sm" />}
            disabled={pending}
            onClick={() => {
              setDraft(null);
              setFailure(null);
            }}
          />
          <IconButton
            type="submit"
            size="mini"
            variant="primary"
            label={words("Decks.save")}
            icon={<Icon name="check" size="sm" />}
            disabled={pending}
          />
        </div>
      </form>
    );
  }

  return (
    <div className="flex items-start gap-1 rounded-md border border-neutral-subtle bg-neutral-surface p-2">
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="mds-body truncate" lang="ar" dir="rtl">
          {card.contentFront}
        </span>
        <span
          className="mds-body-sm line-clamp-2 text-neutral-muted"
          title={card.contentBack}
        >
          {card.contentBack}
        </span>
      </div>
      <div className="flex flex-col">
        <IconButton
          size="mini"
          label={words("Decks.edit")}
          icon={<Icon name="edit" size="sm" />}
          disabled={busy}
          onClick={() => setDraft(cardDraftOf(card))}
        />
        <IconButton
          size="mini"
          label={words("Decks.remove")}
          icon={<Icon name="trash" size="sm" />}
          disabled={busy}
          onClick={onRemove}
        />
      </div>
    </div>
  );
}
