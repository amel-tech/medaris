"use client";

import { Button } from "@medaris/ui/mds/button";
import { Input } from "@medaris/ui/mds/input";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  type ClipboardEvent,
  type FormEvent,
  useRef,
  useState,
  useTransition,
} from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { createCard, createCards } from "../actions";
import {
  type CardDraft,
  type CardType,
  cardBody,
  cardProblems,
  deckErrorKey,
  FACE_MAX,
  FACE_MIN,
  newCardDraft,
  type PastedCards,
  parsePastedCards,
} from "../decks";

/**
 * "Kart ekle" on the deck page itself, with no dialog: the front (Arabic,
 * RTL) and the back side by side, Enter adds the card, the row empties and the
 * cursor goes back to the front for the next one. Lines pasted into either
 * face (two columns from Excel, or "ön;arka") become a batch the müderris adds
 * with one press.
 */
export function CardQuickAdd({
  deckId,
  cardType,
}: {
  deckId: string;
  cardType: CardType;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<CardDraft>(() => newCardDraft(cardType));
  const [sent, setSent] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [batch, setBatch] = useState<PastedCards | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const focusFront = () =>
    (
      form.current?.elements.namedItem(
        "contentFront"
      ) as HTMLInputElement | null
    )?.focus();
  const problems = cardProblems(draft);
  const problem = sent
    ? (problems.contentFront ?? problems.contentBack)
    : undefined;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSent(true);
    setStatus(null);
    setFailure(null);
    if (Object.keys(problems).length > 0) return;
    startTransition(async () => {
      const outcome = await createCard(deckId, cardBody(draft));
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      setDraft(newCardDraft(cardType));
      setSent(false);
      setStatus(words("Decks.cardAdded"));
      focusFront();
      router.refresh();
    });
  };

  const paste = (event: ClipboardEvent<HTMLInputElement>) => {
    const text = event.clipboardData.getData("text");
    if (!/\r?\n/.test(text.trim())) return;
    event.preventDefault();
    setStatus(null);
    setFailure(null);
    setBatch(parsePastedCards(text, cardType));
  };

  const addBatch = (drafts: CardDraft[]) => {
    if (pending || drafts.length === 0) return;
    setFailure(null);
    startTransition(async () => {
      const outcome = await createCards(deckId, drafts.map(cardBody));
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words("Decks.failed"));
        return;
      }
      setBatch(null);
      setStatus(words("Decks.importDone", { count: outcome.data.count }));
      focusFront();
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <form
        ref={form}
        onSubmit={submit}
        aria-label={words("Decks.addCard")}
        className="grid items-start gap-2 [grid-template-columns:minmax(0,1fr)_minmax(0,1fr)_auto] max-md:[grid-template-columns:minmax(0,1fr)]"
      >
        <Input
          name="contentFront"
          lang="ar"
          dir="rtl"
          autoComplete="off"
          placeholder={words("Decks.front")}
          aria-label={words("Decks.front")}
          aria-invalid={sent && problems.contentFront ? true : undefined}
          value={draft.contentFront}
          onPaste={paste}
          onChange={(event) =>
            setDraft({ ...draft, contentFront: event.target.value })
          }
        />
        <Input
          name="contentBack"
          autoComplete="off"
          placeholder={words("Decks.back")}
          aria-label={words("Decks.back")}
          aria-invalid={sent && problems.contentBack ? true : undefined}
          value={draft.contentBack}
          onPaste={paste}
          onChange={(event) =>
            setDraft({ ...draft, contentBack: event.target.value })
          }
        />
        <Button type="submit" loading={pending && batch === null}>
          {words("Decks.add")}
        </Button>
      </form>
      {batch ? (
        <div className="flex flex-wrap items-center gap-3 rounded-md border border-neutral-subtle p-3">
          <span className="mds-body-sm">
            <strong>
              {words("Decks.pasteReady", { count: batch.drafts.length })}
            </strong>
            {batch.skipped.length > 0
              ? ` · ${words("Decks.pasteSkipped", {
                  lines: batch.skipped.join(", "),
                })}`
              : null}
          </span>
          <div className="flex gap-2">
            <Button
              size="small"
              disabled={batch.drafts.length === 0}
              loading={pending}
              onClick={() => addBatch(batch.drafts)}
            >
              {words("Decks.pasteAll")}
            </Button>
            <Button
              size="small"
              variant="ghost"
              disabled={pending}
              onClick={() => setBatch(null)}
            >
              {words("Decks.cancel")}
            </Button>
          </div>
        </div>
      ) : null}
      <p className="mds-body-sm text-neutral-muted" aria-live="polite">
        {failure ??
          (problem === "required"
            ? words("Decks.required")
            : problem === "length"
              ? words("Decks.lengthError", { min: FACE_MIN, max: FACE_MAX })
              : (status ?? words("Decks.quickAddHint")))}
      </p>
    </div>
  );
}
