"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { PlusIcon } from "@medaris/icons";
import type { CreateFlashcardDeckDto } from "@medaris/services/tedrisat";
import { Button } from "@medaris/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@medaris/ui/components/dialog";
import { Form } from "@medaris/ui/custom/form";
import { toastHelper } from "@medaris/ui/lib/toast-helper";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { createFlashCardDeck } from "~/features/flashcards/actions";
import {
  createDeckMetaFormSchema,
  type DeckMetaFormValues,
} from "../../validations/deck-meta-form-schema";
import { useFieldMessages } from "../../validations/field-messages";
import DeckMetaForm from "./deck-meta-form";

export default function CreateDeckButtonDialog() {
  const t = useTranslations("tedris");
  const router = useRouter();

  const messages = useFieldMessages();
  const schema = useMemo(() => createDeckMetaFormSchema(messages), [messages]);

  const form = useForm<DeckMetaFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: "",
      description: "",
      isPublic: false,
    },
  });

  const onSubmit = async (data: CreateFlashcardDeckDto) => {
    const result = await createFlashCardDeck(data);
    if (result.success) {
      const id = result.data?.id ?? null;
      toastHelper.success({
        title: t("CreateDeckButtonDialog.cardCreated"),
        description: t("CreateDeckButtonDialog.cardCreatedDescription"),
      });
      router.push(`/decks/${id}/cards`);
    } else {
      // The API's own reason — "title must be longer than or equal to 5
      // characters" and the like. authenticatedAction already unwraps it from
      // the ResponseError body; showing the generic sentence instead left the
      // visitor with no idea which field to fix.
      //
      // Only for a 400. The same field carries "fetch failed" when tedrisat is
      // unreachable and "Unauthorized: No access token found" when the token
      // has gone — untranslated internals that the localized fallback says
      // better.
      //
      // `"status" in result` rather than the `success` discriminant: tsc does
      // not narrow this union on the `else` branch — the same reason the first
      // version of this line reached for `"error" in result`.
      const reason =
        "status" in result && result.status === 400 ? result.error : "";
      toastHelper.error({
        title: t("CreateDeckButtonDialog.creationError"),
        description:
          reason || t("CreateDeckButtonDialog.creationErrorDescription"),
      });
    }
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="text-white">
          <PlusIcon weight="bold" />
          {t("CreateDeckButtonDialog.createNewDeck")}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[620px]">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader className="mb-6">
              <DialogTitle>{t("CreateDeckButtonDialog.newDeck")}</DialogTitle>
            </DialogHeader>
            <DeckMetaForm control={form.control} />
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">
                  {t("CreateDeckButtonDialog.cancel")}
                </Button>
              </DialogClose>
              <Button type="submit">
                {t("CreateDeckButtonDialog.createDeck")}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
