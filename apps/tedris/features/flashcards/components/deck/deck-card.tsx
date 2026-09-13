"use client";

import {
  BookmarkSimpleIcon,
  CardsIcon,
  GlobeIcon,
  LockIcon,
  StarIcon,
  StudentIcon,
  TrashIcon,
} from "@medaris/icons";
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
import { Card } from "@medaris/ui/components/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@medaris/ui/components/tooltip";
import { toastHelper } from "@medaris/ui/lib/toast-helper";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import {
  addDeckToCollection,
  deleteDeck,
  removeDeckFromCollection,
} from "~/features/flashcards/actions";

type Props = {
  deckId: string;
  title: string;
  cardCount?: number;
  downloadCount?: number;
  description?: string;
  author?: string;
  rating?: number;
  isInCollection?: boolean;
  isPublic?: boolean;
  /** Whether the viewer authored this deck; controls the delete affordance. */
  isOwner?: boolean;
};

function DeckCard({
  deckId,
  title,
  author,
  cardCount,
  rating,
  downloadCount,
  description,
  isInCollection: initialIsInCollection = false,
  isPublic,
  isOwner = false,
}: Props) {
  const t = useTranslations("tedris");
  const [isInCollection, setIsInCollection] = useState(initialIsInCollection);
  const [isProcessing, setIsProcessing] = useState(false);

  // Sync state when prop changes
  useEffect(() => {
    setIsInCollection(initialIsInCollection);
  }, [initialIsInCollection]);

  const handleRemoveDeckFromCollection = async () => {
    const result = await removeDeckFromCollection(deckId);
    if (result.success) {
      setIsInCollection(false);
      toastHelper.success({
        title: t("DeckCard.removedFromCollection"),
        description: t("DeckCard.removedFromCollectionDescription"),
      });
    } else {
      toastHelper.error({
        title: t("DeckCard.error"),
        description: t("DeckCard.errorDescription", {
          action: "removing",
          preposition: "from",
        }),
      });
    }
  };

  const handleAddDeckToCollection = async () => {
    const result = await addDeckToCollection(deckId);
    if (result.success) {
      setIsInCollection(true);
      toastHelper.success({
        title: t("DeckCard.addedToCollection"),
        description: t("DeckCard.addedToCollectionDescription"),
      });
    } else {
      toastHelper.error({
        title: t("DeckCard.error"),
        description: t("DeckCard.errorDescription", {
          action: "adding",
          preposition: "to",
        }),
      });
    }
  };

  const handleDelete = async () => {
    setIsProcessing(true);
    const result = await deleteDeck(deckId);
    if (result.success) {
      toastHelper.success({
        title: t("DeckCard.deckDeleted"),
        description: t("DeckCard.deckDeletedDescription"),
      });
    } else {
      toastHelper.error({
        title: t("DeckCard.deleteError"),
        description: t("DeckCard.deleteErrorDescription"),
      });
    }
    setIsProcessing(false);
  };

  const handleBookmarkClick = async (
    e: React.MouseEvent<HTMLButtonElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setIsProcessing(true);
    if (isInCollection) {
      await handleRemoveDeckFromCollection();
    } else {
      await handleAddDeckToCollection();
    }
    setIsProcessing(false);
  };

  return (
    <Card className="p-6 gap-0 hover:bg-neutral-100 has-[.bookmark-icon:hover]:bg-white cursor-pointer transition-all duration-200 ease-in-out h-full">
      <div className="flex justify-between items-center ">
        <div className="flex items-center gap-2 font-medium">
          {isPublic !== undefined && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="inline-flex">
                  {isPublic ? (
                    <GlobeIcon
                      size={16}
                      weight="regular"
                      className="text-neutral-tertiary shrink-0"
                      aria-label={t("DeckCard.public")}
                    />
                  ) : (
                    <LockIcon
                      size={16}
                      weight="fill"
                      className="text-neutral-tertiary shrink-0"
                      aria-label={t("DeckCard.private")}
                    />
                  )}
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {isPublic ? t("DeckCard.public") : t("DeckCard.private")}
              </TooltipContent>
            </Tooltip>
          )}
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={handleBookmarkClick}
            disabled={isProcessing}
            className="bookmark-icon cursor-pointer hover:bg-neutral-300 h-8 w-8 flex justify-center items-center rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <BookmarkSimpleIcon
              size={20}
              weight={isInCollection ? "fill" : "regular"}
            />
          </button>
          {isOwner && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                {/* The card is wrapped in a <Link>; without these the click
                    navigates to the deck instead of opening the dialog. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  disabled={isProcessing}
                  aria-label={t("DeckCard.deleteDeck")}
                  className="bookmark-icon cursor-pointer hover:bg-neutral-300 h-8 w-8 flex justify-center items-center rounded-full disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <TrashIcon size={20} />
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                <AlertDialogHeader>
                  <AlertDialogTitle>
                    {t("DeckCard.deleteConfirmTitle")}
                  </AlertDialogTitle>
                  <AlertDialogDescription>
                    {t("DeckCard.deleteConfirmDescription", { title })}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t("DeckCard.cancel")}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete}>
                    {t("DeckCard.delete")}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>
      <div className="text-sm mb-2">
        {t("DeckCard.by")} {author}
      </div>
      <div className="flex items-center mb-2 text-sm">
        <div className="text-neutral-tertiary flex items-center mr-4">
          <CardsIcon className="inline-block mr-1" size={14} />
          {cardCount || 0}
        </div>
        <div className="text-neutral-tertiary flex items-center mr-4">
          <StarIcon className="inline-block mr-1" size={14} />
          {rating || 0}
        </div>
        <div className="text-neutral-tertiary flex items-center mr-4">
          <StudentIcon className="inline-block mr-1" size={14} />
          {downloadCount || 0}
        </div>
      </div>
      <div className="text-sm text-neutral-tertiary">{description}</div>
    </Card>
  );
}

export default DeckCard;
