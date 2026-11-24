"use client";

import type {
  PermanentBanRequestListResponse,
  PermanentBanRequestResponse,
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
import { useCallback, useRef, useState } from "react";
import { RejectDialog } from "~/features/deck-review/components/reject-dialog";
import { shortDateTime } from "~/features/deck-review/present";
import { redirectIfUnauthenticated } from "~/lib/unauthenticated";
import type { RequestTab } from "../../platform-admin/present";
import {
  approvePermanentBan,
  loadPermanentBans,
  rejectPermanentBan,
} from "../actions";
import {
  banPlace,
  bansHref,
  permanentBanFailureKey,
  permanentBanSettled,
  permanentBanVariant,
} from "../present";

interface Props {
  /** the waiting requests and both counts; null when the first read failed */
  initial: PermanentBanRequestListResponse | null;
}

/**
 * Kalıcı yasak talepleri (nizam 45, MDRS-194): whoever placed a course, köşk
 * or medrese ban asked for the same person to be barred from all of Medaris.
 * Each request is a card: the person, the ban that stands ("Mevcut yasak")
 * and the request ("Talep"). "Onayla" opens a platform ban beside the lower
 * one; "Reddet" asks for a note the requester will read and leaves the lower
 * ban as it was. Closing the sign-in account is not part of an approval
 * (the design's "hesabını kapatır" waits for an identity-provider client).
 */
export function PermanentBansView({ initial }: Props) {
  const t = useTranslations("nizam.PermanentBansPage");
  const tb = useTranslations("nizam.BansPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const fmt = { locale, timeZone };

  const [tab, setTab] = useState<RequestTab>("PENDING");
  const [lists, setLists] = useState<
    Partial<Record<RequestTab, PermanentBanRequestResponse[]>>
  >({ PENDING: initial?.items });
  const [counts, setCounts] = useState({
    pending: initial?.pendingCount ?? 0,
    decided: initial?.decidedCount ?? 0,
  });
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [approving, setApproving] = useState<string | null>(null);
  const [rejecting, setRejecting] =
    useState<PermanentBanRequestResponse | null>(null);

  const items = lists[tab] ?? [];
  // A read answers for the tab it was asked for: a late answer must not fill
  // the tab on the screen with the other one's requests.
  const ticket = useRef(0);

  const load = useCallback(
    async (next: RequestTab) => {
      const mine = ++ticket.current;
      setLoading(true);
      let result: Awaited<ReturnType<typeof loadPermanentBans>> | null;
      try {
        result = await loadPermanentBans(next);
      } catch {
        result = null;
      }
      if (mine !== ticket.current) return;
      setLoading(false);
      if (redirectIfUnauthenticated(result)) return;
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
    },
    [t]
  );

  const changeTab = (next: RequestTab) => {
    ticket.current++;
    setLoading(false);
    setTab(next);
    if (lists[next] === undefined) void load(next);
  };

  /** The request is decided: it leaves the waiting list, and the decided one is read again when opened. */
  const settle = (id: string) => {
    setLists((current) => ({
      PENDING: (current.PENDING ?? []).filter((r) => r.id !== id),
    }));
    setCounts((c) => ({
      pending: Math.max(0, c.pending - 1),
      decided: c.decided + 1,
    }));
  };

  const fail = (body: unknown, id: string) => {
    if (permanentBanSettled(body)) settle(id);
    toast.error(t("answerFailed"), {
      description: t(permanentBanFailureKey(body) as never),
      duration: Number.POSITIVE_INFINITY,
    });
  };

  const nameOf = (r: PermanentBanRequestResponse) =>
    r.ban.user.name ?? r.ban.user.email ?? t("unknownPerson");

  const approve = async (request: PermanentBanRequestResponse) => {
    if (approving) return;
    setApproving(request.id);
    const result = await approvePermanentBan(request.id);
    setApproving(null);
    if (redirectIfUnauthenticated(result)) return;
    if (!result.success) {
      fail(result.errorBody, request.id);
      return;
    }
    toast.success(t("approved"), {
      description: t("approvedBody", { name: nameOf(request) }),
    });
    settle(request.id);
  };

  const reject = async (note: string): Promise<boolean> => {
    const request = rejecting;
    if (!request) return false;
    const result = await rejectPermanentBan(request.id, note);
    if (redirectIfUnauthenticated(result)) return false;
    if (!result.success) {
      fail(result.errorBody, request.id);
      return permanentBanSettled(result.errorBody);
    }
    toast.success(t("rejected"), {
      description: t("rejectedBody", { name: nameOf(request) }),
    });
    settle(request.id);
    return true;
  };

  const roleOf = (role: string): string | null =>
    tb.has(`roles.${role}` as never)
      ? tb(`roles.${role}` as never).toLocaleLowerCase(locale)
      : null;

  const fact = (label: string, value: string, testId?: string) => (
    <div className="flex flex-col gap-1">
      <dt className="mds-caption">{label}</dt>
      <dd className="m-0" data-testid={testId}>
        <bdi>{value}</bdi>
      </dd>
    </div>
  );

  const card = (r: PermanentBanRequestResponse) => {
    const name = nameOf(r);
    const waiting = r.status === "PENDING";
    const lifted = r.ban.liftedAt !== null && r.ban.liftedAt !== undefined;
    const place = banPlace(r.ban);
    const banner = r.ban.bannedBy.name ?? t("unknownPerson");
    const bannerRole = roleOf(r.ban.bannedRole);
    const requester = r.requestedBy.name ?? t("unknownPerson");
    const titleId = `permanent-ban-${r.id}`;
    return (
      <li key={r.id}>
        <article
          aria-labelledby={titleId}
          className="flex min-w-0 flex-col gap-5 rounded-surface border border-neutral-subtle p-4 sm:p-6"
          data-testid="permanent-ban-card"
        >
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Avatar name={name} decorative />
              <h2 id={titleId} className="mds-h3 m-0">
                <bdi>{name}</bdi>
              </h2>
            </div>
            <Badge variant={permanentBanVariant(r.status)}>
              {t(`status.${r.status}` as never)}
            </Badge>
          </header>

          <div className="grid gap-grid lg:grid-cols-2">
            <section className="flex flex-col gap-3">
              <h3 className="mds-eyebrow m-0">{t("currentBan")}</h3>
              <dl className="m-0 flex flex-col gap-3">
                {fact(
                  t("scope"),
                  [t(`scopes.${r.ban.scope}` as never), place]
                    .filter(Boolean)
                    .join(" · "),
                  "permanent-ban-scope"
                )}
                {fact(
                  t("bannedBy"),
                  `${[banner, bannerRole].filter(Boolean).join(", ")} · ${shortDateTime(r.ban.createdAt, fmt)}`
                )}
                {fact(t("banReason"), r.ban.reason)}
              </dl>
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="mds-eyebrow m-0">{t("request")}</h3>
              <dl className="m-0 flex flex-col gap-3">
                {fact(
                  t("requestedBy"),
                  `${[
                    requester,
                    r.requestedBy.id === r.ban.bannedBy.id
                      ? t("theBanner")
                      : null,
                  ]
                    .filter(Boolean)
                    .join(", ")} · ${shortDateTime(r.createdAt, fmt)}`
                )}
                {fact(t("requestReason"), r.reason, "permanent-ban-reason")}
              </dl>
            </section>
          </div>

          {waiting && lifted ? (
            <Alert tone="warning" title={t("liftedTitle")}>
              {t("liftedBody")}
            </Alert>
          ) : null}
          {!waiting && r.decidedAt ? (
            <p className="mds-caption m-0" data-testid="permanent-ban-decided">
              {t("decidedLine", {
                name: r.decidedBy?.name ?? t("unknownPerson"),
                when: shortDateTime(r.decidedAt, fmt),
              })}
            </p>
          ) : null}
          {!waiting && r.decisionNote ? (
            <Alert tone="neutral" title={t("decisionNote")}>
              <bdi>{r.decisionNote}</bdi>
            </Alert>
          ) : null}

          <div className="flex flex-wrap justify-end gap-3">
            <Button
              variant="outline"
              href={bansHref(r.ban.user)}
              aria-label={t("seeInBansLabel", { name })}
            >
              {t("seeInBans")}
            </Button>
            {waiting ? (
              <>
                <Button
                  variant="outline"
                  disabled={approving === r.id}
                  aria-label={t("rejectLabel", { name })}
                  onClick={() => setRejecting(r)}
                >
                  {t("reject")}
                </Button>
                <Button
                  loading={approving === r.id}
                  disabled={
                    lifted || (approving !== null && approving !== r.id)
                  }
                  aria-label={t("approveLabel", { name })}
                  onClick={() => void approve(r)}
                >
                  {t("approve")}
                </Button>
              </>
            ) : null}
          </div>
        </article>
      </li>
    );
  };

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="permanent-bans"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="mds-reading m-0 max-w-[48rem]">{t("intro")}</p>
        <p className="mds-reading m-0 max-w-[48rem]">{t("introApprove")}</p>
        <p className="mds-reading m-0 max-w-[48rem]">{t("introReject")}</p>
      </header>

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
            onChange={(v) => changeTab(v as RequestTab)}
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
            <div className="flex flex-col gap-grid" aria-busy="true">
              {[0, 1].map((n) => (
                <Skeleton key={n} height="18rem" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState>{t(`empty.${tab}`)}</EmptyState>
          ) : (
            <ul
              className="m-0 flex list-none flex-col gap-grid p-0"
              data-testid="permanent-ban-list"
            >
              {items.map(card)}
            </ul>
          )}
        </div>
      )}

      <RejectDialog
        open={rejecting !== null}
        onOpenChange={(open) => {
          if (!open) setRejecting(null);
        }}
        kind="permanentBan"
        subject={rejecting ? nameOf(rejecting) : null}
        onSubmit={reject}
      />
    </div>
  );
}
