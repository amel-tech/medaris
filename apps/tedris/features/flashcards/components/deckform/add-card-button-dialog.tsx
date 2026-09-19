"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@medaris/icons";
import { Button } from "@medaris/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@medaris/ui/components/dialog";
import { Form } from "@medaris/ui/custom/form";
import ATFormGroupTextArea from "@medaris/ui/custom/form-group-text-area";
import { toastHelper } from "@medaris/ui/lib/toast-helper";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { createFlashcards } from "~/features/flashcards/actions";
import { useFieldMessages } from "~/features/flashcards/validations/field-messages";
import {
  createFlashcardFormSchema,
  type FlashcardFormValues,
} from "~/features/flashcards/validations/flashcard-form-schema";

const emptyCard: FlashcardFormValues = { contentFront: "", contentBack: "" };

export default function AddCardButtonDialog({ deckId }: { deckId: string }) {
  const t = useTranslations("tedris");
  const [open, setOpen] = useState(false);
  const messages = useFieldMessages();
  const schema = useMemo(() => createFlashcardFormSchema(messages), [messages]);

  const form = useForm<FlashcardFormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyCard,
  });

  const onSubmit = async (data: FlashcardFormValues) => {
    const result = await createFlashcards(deckId, [data]);
    if (result.success) {
      toastHelper.success({
        title: t("DeckCards.cardAdded"),
        description: t("DeckCards.cardAddedDescription"),
      });
      form.reset(emptyCard);
      setOpen(false);
    } else {
      // tedris compiles with `strict: false`, so the discriminated union does
      // not narrow on `result.success`; `in` narrowing does.
      const serverMessage = "error" in result ? result.error : undefined;
      toastHelper.error({
        title: t("DeckCards.addError"),
        description: serverMessage || t("DeckCards.addErrorDescription"),
      });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) form.reset(emptyCard);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="text-white">
          <PlusIcon weight="bold" />
          {t("DeckCards.addCard")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader className="mb-6">
              <DialogTitle>{t("DeckCards.newCard")}</DialogTitle>
            </DialogHeader>
            <ATFormGroupTextArea
              name="contentFront"
              label={t("DeckCards.frontFace")}
              placeholder={t("DeckCards.frontPlaceholder")}
              control={form.control}
              required
            />
            <ATFormGroupTextArea
              name="contentBack"
              label={t("DeckCards.backFace")}
              placeholder={t("DeckCards.backPlaceholder")}
              control={form.control}
              required
            />
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                {t("DeckCards.cancel")}
              </Button>
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting
                  ? t("DeckCards.adding")
                  : t("DeckCards.addCard")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
