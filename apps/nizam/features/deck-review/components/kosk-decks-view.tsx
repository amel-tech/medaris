"use client";

import type {
  DeckProposalResponse,
  ManagedKoskDeckResponse,
  ManagedKoskDecksResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Card } from "@medaris/ui/mds/card";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import {
  hideKoskDeck,
  loadManagedKoskDecks,
  rejectDeckProposal,
} from "../actions";
import {
  deckErrorKey,
  deckFailureKey,
  isGone,
  mergeById,
  newDeckHref,
  nextPage,
  shortDate,
  shortDateTime,
} from "../present";
import { LoadFailed } from "./load-failed";
import { RejectDialog } from "./reject-dialog";

interface Props {
  koskId: string;
  koskName: string;
  /** null when the first read failed */
  initial: ManagedKoskDecksResponse | null;
}

/**
 * Köşk desteleri (nizam 30): the köşk's shared decks, the müderris proposals
 * waiting for an answer and "Köşk destesi aç". "Kabul et" opens the deck form
 * filled in from the proposal; "Reddet" asks for the reason the proposer will
 * read; "Gizle" moves a deck to the köşk's archive. The block of proposals is
 * not drawn when there are none.
 */
export function KoskDecksView({ koskId, koskName, initial }: Props) {
  const t = useTranslations("nizam.KoskDecksPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const fmt = { locale, timeZone };

  const [decks, setDecks] = useState<ManagedKoskDeckResponse[]>(
    initial?.decks ?? []
  );
  const [proposals, setProposals] = useState<DeckProposalResponse[]>(
    initial?.proposals ?? []
  );
  // Every deck and every waiting proposal, not the page: more are left while
  // fewer are shown.
  const [decksTotal, setDecksTotal] = useState(initial?.decksTotal ?? 0);
  const [proposalsTotal, setProposalsTotal] = useState(
    initial?.proposalsTotal ?? 0
  );
  // router.refresh() ("Yeniden dene") hands this component a new `initial`;
  // useState only reads its argument on the first render, so adopt the fresh
  // server data here, during render, when the prop identity changes.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setDecks(initial?.decks ?? []);
    setProposals(initial?.proposals ?? []);
    setDecksTotal(initial?.decksTotal ?? 0);
    setProposalsTotal(initial?.proposalsTotal ?? 0);
  }
  const [loadingMore, setLoadingMore] = useState<"decks" | "proposals" | null>(
    null
  );
  const [refusing, setRefusing] = useState<DeckProposalResponse | null>(null);
  const [hiding, setHiding] = useState<ManagedKoskDeckResponse | null>(null);
  const [busy, setBusy] = useState(false);

  const failure = (body: unknown) =>
    toast.error(t("actionFailed"), {
      description: t(deckFailureKey(body) as never),
      duration: Number.POSITIVE_INFINITY,
    });

  /** "Daha fazla göster": the next page of one list, added below what is shown. */
  const loadMore = async (list: "decks" | "proposals") => {
    setLoadingMore(list);
    let result: Awaited<ReturnType<typeof loadManagedKoskDecks>> | null = null;
    try {
      result = await loadManagedKoskDecks(
        koskId,
        nextPage(list === "decks" ? decks.length : proposals.length)
      );
    } catch {
      result = null;
    }
    setLoadingMore(null);
    if (!result?.success) {
      toast.error(t("loadFailedTitle"), {
        description: t("loadFailed"),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    // One read cuts both lists by the same page; only the asked one is taken.
    const { data } = result;
    if (list === "decks") {
      setDecks((shown) => mergeById(shown, data.decks));
    } else {
      setProposals((shown) => mergeById(shown, data.proposals));
    }
    setDecksTotal(data.decksTotal);
    setProposalsTotal(data.proposalsTotal);
  };

  const dropProposal = (id: string) => {
    setProposals((list) => list.filter((p) => p.id !== id));
    setProposalsTotal((n) => Math.max(0, n - 1));
  };

  const dropDeck = (id: string) => {
    setDecks((list) => list.filter((d) => d.id !== id));
    setDecksTotal((n) => Math.max(0, n - 1));
  };

  const refuse = async (reason: string): Promise<boolean> => {
    if (!refusing) return false;
    const target = refusing;
    const result = await rejectDeckProposal(koskId, target.id, reason);
    if (!result.success) {
      failure(result.errorBody);
      if (isGone(result.errorBody)) {
        dropProposal(target.id);
        return true;
      }
      return false;
    }
    dropProposal(target.id);
    toast.success(t("proposalRefused"), {
      description: t("proposalRefusedBody", { title: target.title }),
    });
    return true;
  };

  const hide = async () => {
    if (!hiding) return;
    const target = hiding;
    setBusy(true);
    const result = await hideKoskDeck(target.id);
    setBusy(false);
    if (!result.success) {
      failure(result.errorBody);
      if (deckErrorKey(result.errorBody) === "errors.deckGone") {
        dropDeck(target.id);
        setHiding(null);
      }
      return;
    }
    dropDeck(target.id);
    setHiding(null);
    toast.success(t("hidden"), {
      description: t("hiddenBody", { title: target.title }),
    });
  };

  const columns: TableColumn<ManagedKoskDeckResponse>[] = [
    {
      key: "deck",
      header: t("columns.deck"),
      rowHeader: true,
      render: (deck) => (
        <span className="flex items-center gap-3">
          <Avatar name={deck.title} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{deck.title}</bdi>
            <span className="mds-caption">
              {deck.description ? (
                <>
                  <bdi>{deck.description}</bdi> ·{" "}
                </>
              ) : null}
              {t(`cardTypes.${deck.cardType}`)}
            </span>
          </span>
        </span>
      ),
    },
    {
      key: "cards",
      header: t("columns.cards"),
      align: "right",
      render: (deck) => deck.cardCount,
    },
    {
      key: "changed",
      header: t("columns.changed"),
      render: (deck) => (
        <span className="whitespace-nowrap">
          {shortDateTime(deck.updatedAt, fmt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      render: (deck) => (
        <span className="flex flex-nowrap justify-end gap-2">
          <Button
            variant="outline"
            size="small"
            href={`/${locale}/decks/${deck.id}/cards`}
            aria-label={t("editCardsLabel", { title: deck.title })}
          >
            {t("editCards")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            aria-label={t("hideLabel", { title: deck.title })}
            onClick={() => setHiding(deck)}
          >
            {t("hide")}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-decks"
    >
      {initial === null ? (
        <LoadFailed
          title={t("loadFailedTitle")}
          body={t("loadFailed")}
          retryLabel={t("retry")}
        />
      ) : null}

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[48rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{koskName ? t("intro", { kosk: koskName }) : t("introNoName")}</p>
        </div>
        {initial === null ? (
          <Button disabled iconLeft={<Icon name="plus" size="sm" />}>
            {t("open")}
          </Button>
        ) : (
          <Button
            href={`/${locale}${newDeckHref(koskId)}`}
            iconLeft={<Icon name="plus" size="sm" />}
          >
            {t("open")}
          </Button>
        )}
      </header>

      {initial !== null && proposals.length > 0 ? (
        <section
          aria-labelledby="proposals-heading"
          className="flex flex-col gap-4"
          data-testid="proposals"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="proposals-heading" className="mds-h2">
              {t("proposalsHeading")}
            </h2>
            <p className="mds-caption" data-testid="proposals-count">
              {t("proposalsWaiting", { count: proposalsTotal })}
            </p>
          </div>
          <div className="grid gap-grid md:grid-cols-2">
            {proposals.map((proposal) => (
              <Card
                key={proposal.id}
                title={<bdi>{proposal.title}</bdi>}
                data-testid="proposal"
                footer={
                  <span className="mds-caption">
                    {t("proposedBy", {
                      name: proposal.proposedBy.name ?? t("unknownPerson"),
                    })}
                    {proposal.courseTitle ? ` · ${proposal.courseTitle}` : ""}
                    {` · ${shortDate(proposal.createdAt, fmt)}`}
                  </span>
                }
              >
                {proposal.description ? (
                  <p>
                    <bdi>{proposal.description}</bdi>
                  </p>
                ) : null}
                <div className="flex gap-2 pt-3">
                  <Button
                    variant="outline"
                    size="small"
                    href={`/${locale}${newDeckHref(koskId, proposal.id)}`}
                    aria-label={t("acceptLabel", { title: proposal.title })}
                  >
                    {t("accept")}
                  </Button>
                  <Button
                    variant="ghost"
                    size="small"
                    aria-label={t("refuseLabel", { title: proposal.title })}
                    onClick={() => setRefusing(proposal)}
                  >
                    {t("refuse")}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
          {proposals.length < proposalsTotal ? (
            <Button
              variant="outline"
              loading={loadingMore === "proposals"}
              onClick={() => void loadMore("proposals")}
              data-testid="more-proposals"
            >
              {t("loadMore")}
            </Button>
          ) : null}
          <p className="mds-caption">{t("proposalsNote")}</p>
        </section>
      ) : null}

      {initial === null ? null : (
        <section
          aria-labelledby="decks-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="decks-heading" className="mds-h2">
              {t("decksHeading")}
            </h2>
            <p className="mds-caption" data-testid="decks-count">
              {t("decksCount", { count: decksTotal })}
            </p>
          </div>
          <Table
            caption={t("caption", { kosk: koskName })}
            columns={columns}
            rows={decks}
            rowKey={(deck) => deck.id}
            empty={t("empty")}
            responsive="stack"
          />
          {decks.length < decksTotal ? (
            <Button
              variant="outline"
              loading={loadingMore === "decks"}
              onClick={() => void loadMore("decks")}
              data-testid="more-decks"
            >
              {t("loadMore")}
            </Button>
          ) : null}
        </section>
      )}

      <RejectDialog
        open={refusing !== null}
        onOpenChange={(open) => {
          if (!open) setRefusing(null);
        }}
        kind="proposal"
        subject={refusing?.title ?? null}
        onSubmit={refuse}
      />

      <AlertDialog
        open={hiding !== null}
        onOpenChange={(open) => {
          if (!open && !busy) setHiding(null);
        }}
        eyebrow={hiding?.title}
        title={t("hideTitle")}
        confirmLabel={t("hideConfirm")}
        cancelLabel={t("cancel")}
        closeLabel={t("close")}
        confirmLoading={busy}
        onConfirm={() => void hide()}
      >
        <p>{t("hideBody", { title: hiding?.title ?? "", kosk: koskName })}</p>
      </AlertDialog>
    </div>
  );
}
