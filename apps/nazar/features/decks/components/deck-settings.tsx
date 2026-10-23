"use client";

import { Alert } from "@medaris/ui/mds/alert";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Select } from "@medaris/ui/mds/select";
import { Textarea } from "@medaris/ui/mds/textarea";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { type FormEvent, useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import { deleteDeck, updateDeck } from "../actions";
import {
  DECK_DESCRIPTION_MAX,
  DECK_TITLE_MAX,
  DECK_TITLE_MIN,
  type DeckDraft,
  type DeckFact,
  deckDraftOf,
  deckErrorKey,
  deckPatch,
  deckProblems,
  decksHref,
  type WeekOption,
} from "../decks";

/**
 * "Deste ayarları": title, description and week, saved with only the changed
 * keys; "Yayımla" or "Taslağa çek" flips the draft flag; "Desteyi sil" is
 * offered for a draft alone, behind a confirmation. A published deck the API
 * refuses to delete says so in words, from its code.
 */
export function DeckSettings({
  courseId,
  deck,
  weeks,
}: {
  courseId: string;
  deck: DeckFact;
  weeks: WeekOption[];
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DeckDraft>(() => deckDraftOf(deck));
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const problems = deckProblems(draft);

  const send = (patch: Parameters<typeof updateDeck>[2], done: string) => {
    if (pending) return;
    setFailure(null);
    startTransition(async () => {
      const outcome = await updateDeck(courseId, deck.id, patch);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      notify({ tone: "success", title: words(done) });
      router.refresh();
    });
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSent(true);
    if (Object.keys(problems).length > 0) return;
    const patch = deckPatch(deck, draft);
    if (Object.keys(patch).length === 0) return;
    send(patch, "Decks.saved");
  };

  const toggleDraft = () => {
    send(
      { draft: !deck.draft },
      deck.draft ? "Decks.published" : "Decks.draftState"
    );
  };

  const remove = () => {
    setConfirmDelete(false);
    if (pending) return;
    setFailure(null);
    startTransition(async () => {
      const outcome = await deleteDeck(courseId, deck.id);
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      notify({ tone: "success", title: words("Decks.deleted") });
      router.push(decksHref(courseId));
    });
  };

  const titleError =
    sent && problems.title === "required"
      ? words("Decks.required")
      : sent && problems.title === "length"
        ? words("Decks.lengthError", {
            min: DECK_TITLE_MIN,
            max: DECK_TITLE_MAX,
          })
        : undefined;

  return (
    <section className="flex max-inline-measure flex-col gap-5">
      <h2 className="mds-h2">{words("Decks.settingsTitle")}</h2>
      <form onSubmit={save} className="flex flex-col gap-5">
        <Field label={words("Decks.titleField")} error={titleError} required>
          <Input
            name="title"
            value={draft.title}
            onChange={(event) =>
              setDraft({ ...draft, title: event.target.value })
            }
          />
        </Field>
        <Field
          label={words("Decks.descriptionField")}
          error={
            sent && problems.description === "length"
              ? words("Decks.descriptionLength", { max: DECK_DESCRIPTION_MAX })
              : undefined
          }
        >
          <Textarea
            name="description"
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </Field>
        <Field label={words("Decks.weekField")}>
          <Select
            name="weekId"
            value={draft.weekId || null}
            placeholder={words("Decks.weekNone")}
            options={weeks.map((week) => ({
              value: week.id,
              label: words("Decks.weekOption", {
                week: week.weekNumber,
                title: week.title,
              }),
            }))}
            onChange={(value) => setDraft({ ...draft, weekId: value ?? "" })}
          />
        </Field>
        <p className="mds-body-sm">
          {deck.draft ? words("Decks.draftState") : words("Decks.published")}
        </p>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" loading={pending}>
            {words("Decks.save")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={toggleDraft}
          >
            {deck.draft ? words("Decks.publish") : words("Decks.unpublish")}
          </Button>
        </div>
      </form>
      {deck.draft ? (
        <div className="flex flex-col gap-3">
          <p className="mds-body-sm text-neutral-muted">
            {words("Decks.deleteDeckHelp")}
          </p>
          <div>
            <Button
              variant="destructive"
              disabled={pending}
              onClick={() => setConfirmDelete(true)}
            >
              {words("Decks.deleteDeck")}
            </Button>
          </div>
        </div>
      ) : (
        <p className="mds-body-sm text-neutral-muted">
          {words("Decks.deleteDeckBlocked")}
        </p>
      )}
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={words("Decks.deleteDeck")}
        confirmLabel={words("Decks.deleteDeck")}
        confirmVariant="destructive"
        onConfirm={remove}
      >
        {words("Decks.deleteDeckHelp")}
      </AlertDialog>
    </section>
  );
}
