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
import { useForm } from "react-hook-form";
import type z from "zod";
import { createFlashCardDeck } from "~/features/flashcards/actions";
import { deckMetaFormSchema } from "../../validations/deck-meta-form-schema";
import DeckMetaForm from "./deck-meta-form";

export default function CreateDeckButtonDialog() {
  const t = useTranslations("tedris");
  const router = useRouter();

  const form = useForm<z.infer<typeof deckMetaFormSchema>>({
    resolver: zodResolver(deckMetaFormSchema),
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
      toastHelper.error({
        title: t("CreateDeckButtonDialog.creationError"),
        description: t("CreateDeckButtonDialog.creationErrorDescription"),
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
