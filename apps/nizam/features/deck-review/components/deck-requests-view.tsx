"use client";

import type {
  DeckPublishRequestListResponse,
  DeckPublishRequestResponse,
  DeckRequestCardsResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Tabs } from "@medaris/ui/mds/tabs";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useEffect, useState } from "react";
import {
  approveDeckRequest,
  loadDeckRequests,
  loadRequestCards,
  rejectDeckRequest,
} from "../actions";
import { deckErrorKey, isGone, longDateTime, shortDateTime } from "../present";
import { RejectDialog } from "./reject-dialog";

type Tab = "PENDING" | "DECIDED";
type Cards =
  | { state: "loading" }
  | { state: "failed" }
  | ({ state: "ready" } & DeckRequestCardsResponse);

interface Props {
  /** the waiting requests and both counts; null when the first read failed */
  initial: DeckPublishRequestListResponse | null;
}

/**
 * Deste yayın istekleri (nizam 16): the members' requests to make a deck
 * public, waiting and answered. A waiting request shows three sample cards;
 * every look at them is written to the audit log by tedrisat, which is why the
 * cards are read only once a request is selected. "Yayımla" opens the deck to
 * everyone, "Reddet" asks for a reason the owner will read.
 */
export function DeckRequestsView({ initial }: Props) {
  const t = useTranslations("nizam.DeckRequestsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const fmt = { locale, timeZone };

  const [tab, setTab] = useState<Tab>("PENDING");
  const [lists, setLists] = useState<
    Partial<Record<Tab, DeckPublishRequestResponse[]>>
  >({ PENDING: initial?.items });
  const [counts, setCounts] = useState({
    pending: initial?.pendingCount ?? 0,
    decided: initial?.decidedCount ?? 0,
  });
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(
    initial?.items[0]?.id ?? null
  );
  const [cards, setCards] = useState<Cards | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const items = lists[tab] ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? null;

  const load = useCallback(
    async (next: Tab) => {
      setLoading(true);
      let result: Awaited<ReturnType<typeof loadDeckRequests>> | null = null;
      try {
        result = await loadDeckRequests(next);
      } catch {
        result = null;
      }
      setLoading(false);
      if (!result?.success) {
        setFailed(true);
        toast.error(t("loadFailedTitle"), {
          description: t("loadFailed"),
          duration: Number.POSITIVE_INFINITY,
        });
        return;
      }
      setFailed(false);
      setLists((current) => ({ ...current, [next]: result.data.items }));
      setCounts({
        pending: result.data.pendingCount,
        decided: result.data.decidedCount,
      });
      setSelectedId(result.data.items[0]?.id ?? null);
    },
    [t]
  );

  const changeTab = (next: Tab) => {
    setTab(next);
    setSelectedId((lists[next] ?? [])[0]?.id ?? null);
    if (lists[next] === undefined) void load(next);
  };

  // The sample cards of the selected waiting request; reading them is audited.
  useEffect(() => {
    setShowAll(false);
    if (tab !== "PENDING" || !selectedId) {
      setCards(null);
      return;
    }
    let current = true;
    setCards({ state: "loading" });
    void loadRequestCards(selectedId, false).then((result) => {
      if (!current) return;
      setCards(
        result.success
          ? { state: "ready", ...result.data }
          : { state: "failed" }
      );
    });
    return () => {
      current = false;
    };
  }, [tab, selectedId]);

  const readAll = async () => {
    if (!selectedId) return;
    setCards({ state: "loading" });
    const result = await loadRequestCards(selectedId, true);
    setShowAll(result.success);
    setCards(
      result.success ? { state: "ready", ...result.data } : { state: "failed" }
    );
  };

  /** The request is answered: it leaves the waiting list and the next one is selected. */
  const settle = (id: string) => {
    const rest = (lists.PENDING ?? []).filter((r) => r.id !== id);
    setLists({ PENDING: rest });
    setCounts((c) => ({
      pending: Math.max(0, c.pending - 1),
      decided: c.decided + 1,
    }));
    setSelectedId(rest[0]?.id ?? null);
  };

  const fail = (body: unknown, fallback: string, id: string) => {
    const key = deckErrorKey(body);
    if (isGone(body)) settle(id);
    toast.error(t("answerFailed"), {
      description: key ? t(key as never) : fallback,
      duration: Number.POSITIVE_INFINITY,
    });
  };

  const approve = async () => {
    if (!selected) return;
    setBusy(true);
    const result = await approveDeckRequest(selected.id);
    setBusy(false);
    if (!result.success) {
      fail(result.errorBody, result.error, selected.id);
      return;
    }
    toast.success(t("published"), {
      description: t("publishedBody", { title: selected.title }),
    });
    settle(selected.id);
  };

  const reject = async (reason: string): Promise<boolean> => {
    if (!selected) return false;
    const result = await rejectDeckRequest(selected.id, reason);
    if (!result.success) {
      fail(result.errorBody, result.error, selected.id);
      return isGone(result.errorBody);
    }
    toast.success(t("rejected"), {
      description: t("rejectedBody", { title: selected.title }),
    });
    settle(selected.id);
    return true;
  };

  const owner = (r: DeckPublishRequestResponse) =>
    r.owner.name ?? t("unknownPerson");

  const listItem = (r: DeckPublishRequestResponse) => {
    const active = r.id === selectedId;
    return (
      <li key={r.id}>
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-surface p-3 text-start"
          style={
            active
              ? { background: "var(--background-color-selected, #eceefc)" }
              : undefined
          }
          aria-current={active ? "true" : undefined}
          data-testid="deck-request-item"
          onClick={() => setSelectedId(r.id)}
        >
          <Avatar name={r.title} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{r.title}</bdi>
            <span className="mds-caption">
              <bdi>{owner(r)}</bdi> · {t("cardCount", { count: r.cardCount })}
            </span>
            <span className="mds-caption">
              {shortDateTime(r.decidedAt ?? r.requestedAt, fmt)}
              {tab === "DECIDED"
                ? ` · ${t(`outcome.${r.outcome}` as never)}`
                : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const cardGrid = () => {
    if (!cards || cards.state === "loading") {
      return (
        <div className="grid gap-grid sm:grid-cols-3" aria-busy="true">
          {[0, 1, 2].map((n) => (
            <Skeleton key={n} height="9rem" />
          ))}
        </div>
      );
    }
    if (cards.state === "failed") {
      return <Alert tone="error">{t("cardsFailed")}</Alert>;
    }
    if (cards.items.length === 0) {
      return <EmptyState>{t("noCards")}</EmptyState>;
    }
    return (
      <div className="grid gap-grid sm:grid-cols-3" data-testid="card-sample">
        {cards.items.map((card) => (
          <article
            key={card.id}
            className="flex flex-col gap-3 rounded-surface border border-neutral-subtle p-4"
          >
            <span className="mds-caption">{t("front")}</span>
            <bdi className="mds-reading" dir="auto">
              {card.front}
            </bdi>
            <hr className="border-neutral-subtle" />
            <span className="mds-caption">{t("back")}</span>
            <bdi dir="auto">{card.back}</bdi>
          </article>
        ))}
      </div>
    );
  };

  const detail = () => {
    if (!selected) return null;
    const waiting = selected.outcome === "PENDING";
    return (
      <section
        aria-labelledby="request-title"
        className="flex flex-col gap-5 rounded-surface border border-neutral-subtle p-6"
        data-testid="deck-request-detail"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="mds-eyebrow">{t("detailEyebrow")}</span>
            <h2 id="request-title" className="mds-h2">
              <bdi>{selected.title}</bdi>
            </h2>
          </div>
          <Badge
            variant={
              waiting
                ? "warning"
                : selected.outcome === "PUBLISHED"
                  ? "success"
                  : "error"
            }
          >
            {t(`status.${selected.outcome}` as never)}
          </Badge>
        </header>

        <dl className="grid gap-4 sm:grid-cols-4">
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("owner")}</dt>
            <dd className="m-0 flex items-center gap-2">
              <Avatar name={owner(selected)} decorative />
              <bdi>{owner(selected)}</bdi>
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("cards")}</dt>
            <dd className="m-0">
              {t("cardCount", { count: selected.cardCount })}
            </dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("cardType")}</dt>
            <dd className="m-0">{t(`cardTypes.${selected.cardType}`)}</dd>
          </div>
          <div className="flex flex-col gap-1">
            <dt className="mds-caption">{t("requestedAt")}</dt>
            <dd className="m-0">{longDateTime(selected.requestedAt, fmt)}</dd>
          </div>
        </dl>

        {selected.description ? (
          <p className="mds-reading">
            <bdi>{selected.description}</bdi>
          </p>
        ) : null}

        {waiting ? (
          <>
            <div className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="mds-h3">{t("sampleHeading")}</h3>
                {showAll ? null : (
                  <Button
                    variant="link"
                    onClick={() => void readAll()}
                    data-testid="all-cards"
                  >
                    {t("allCards")}
                  </Button>
                )}
              </div>
              <p className="mds-caption">{t("auditNote")}</p>
            </div>
            {cardGrid()}
            {cards?.state === "ready" ? (
              <p className="mds-caption" data-testid="cards-total">
                {t("allCardsCount", { count: cards.total })}
              </p>
            ) : null}
            <hr className="border-neutral-subtle" />
            <p className="mds-caption max-w-[40rem]">{t("publishNote")}</p>
            <div className="flex gap-3">
              <Button loading={busy} onClick={() => void approve()}>
                {t("publish")}
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setRejecting(true)}
              >
                {t("reject")}
              </Button>
            </div>
          </>
        ) : selected.outcome === "REJECTED" && selected.rejectReason ? (
          <Alert tone="neutral" title={t("rejectReasonTitle")}>
            <bdi>{selected.rejectReason}</bdi>
          </Alert>
        ) : null}
      </section>
    );
  };

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="deck-requests"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro")}</p>
      </header>

      <Alert tone="neutral" title={t("noticeTitle")}>
        {t("notice")}
      </Alert>

      {failed && lists[tab] === undefined ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={() => void load(tab)}>
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <div className="flex flex-col gap-4">
          <Tabs
            label={t("tabsLabel")}
            locale={locale}
            value={tab}
            onChange={(v) => changeTab(v as Tab)}
            tabs={[
              {
                value: "PENDING",
                label: t("tabs.PENDING"),
                count: counts.pending,
              },
              {
                value: "DECIDED",
                label: t("tabs.DECIDED"),
                count: counts.decided,
              },
            ]}
          />
          {loading && lists[tab] === undefined ? (
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} height="4.5rem" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState>{t(`empty.${tab}`)}</EmptyState>
          ) : (
            <div className="grid gap-grid lg:grid-cols-[22rem_1fr]">
              <ul
                className="m-0 flex list-none flex-col gap-1 self-start rounded-surface border border-neutral-subtle p-2"
                data-testid="deck-request-list"
              >
                {items.map(listItem)}
              </ul>
              {detail()}
            </div>
          )}
        </div>
      )}

      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        kind="request"
        subject={selected?.title ?? null}
        onSubmit={reject}
      />
    </div>
  );
}
