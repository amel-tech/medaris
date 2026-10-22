"use client";

import type { Unauthenticated } from "@medaris/auth/client";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Dialog, DialogClose } from "@medaris/ui/mds/dialog";
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
import { createDeck } from "../actions";
import {
  CARD_TYPES,
  type CardType,
  createDeckBody,
  DECK_DESCRIPTION_MAX,
  DECK_TITLE_MAX,
  DECK_TITLE_MIN,
  type DeckDraft,
  type DeckField,
  deckErrorKey,
  deckHref,
  deckProblems,
  newDeckDraft,
  type WeekOption,
} from "../decks";

/**
 * "Deste aç": a title, an optional description, the card type (Kelime or
 * Hadis), an optional week and "Taslak olarak kaydet". A created deck opens on
 * its own page, where its cards are added. A refusal is worded from its code;
 * a session that is over goes to sign-in.
 */
export function DeckFormDialog({
  courseId,
  weeks,
  onClose,
}: {
  courseId: string;
  weeks: WeekOption[];
  onClose: () => void;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<DeckDraft>(newDeckDraft);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const problems = deckProblems(draft);
  const fieldError = (field: DeckField): string | undefined => {
    if (!sent) return undefined;
    const problem = problems[field];
    if (problem === "required") return words("Decks.required");
    if (problem === "length")
      return field === "title"
        ? words("Decks.lengthError", {
            min: DECK_TITLE_MIN,
            max: DECK_TITLE_MAX,
          })
        : words("Decks.descriptionLength", { max: DECK_DESCRIPTION_MAX });
    return undefined;
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setSent(true);
    setFailure(null);
    if (Object.keys(problems).length > 0) return;
    startTransition(async () => {
      const outcome: Awaited<ReturnType<typeof createDeck>> | Unauthenticated =
        await createDeck(courseId, createDeckBody(draft));
      if (handleUnauthenticated(outcome)) return;
      if (!outcome.success) {
        setFailure(words(`Decks.${deckErrorKey(outcome.code)}`));
        return;
      }
      notify({ tone: "success", title: words("Decks.created") });
      onClose();
      router.push(deckHref(courseId, outcome.data.id));
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      form
      onSubmit={submit}
      size="md"
      title={words("Decks.newTitle")}
      footer={
        <>
          <DialogClose>{words("Decks.cancel")}</DialogClose>
          <Button type="submit" loading={pending}>
            {words("Decks.create")}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <Field
          label={words("Decks.titleField")}
          help={words("Decks.titleHelp")}
          error={fieldError("title")}
          required
        >
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
          help={words("Decks.descriptionHelp")}
          error={fieldError("description")}
        >
          <Textarea
            name="description"
            value={draft.description}
            onChange={(event) =>
              setDraft({ ...draft, description: event.target.value })
            }
          />
        </Field>
        <Field label={words("Decks.cardTypeField")} required>
          <Select
            name="cardType"
            value={draft.cardType}
            options={CARD_TYPES.map((type: CardType) => ({
              value: type,
              label:
                type === "HADEETH"
                  ? words("Decks.typeHadeeth")
                  : words("Decks.typeVocabulary"),
            }))}
            onChange={(value) =>
              value && setDraft({ ...draft, cardType: value as CardType })
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
        <Checkbox
          label={words("Decks.draftField")}
          description={words("Decks.draftHelp")}
          checked={draft.draft}
          onCheckedChange={(checked) => setDraft({ ...draft, draft: checked })}
        />
        {failure ? <Alert tone="error">{failure}</Alert> : null}
      </div>
    </Dialog>
  );
}
