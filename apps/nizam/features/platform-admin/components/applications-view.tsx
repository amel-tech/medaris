"use client";

import type {
  KoskApplicationDetailResponse,
  KoskApplicationItemResponse,
  KoskApplicationListResponse,
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
import { RejectDialog } from "~/features/deck-review/components/reject-dialog";
import { longDateTime, shortDateTime } from "~/features/deck-review/present";
import { OpenKoskDialog } from "~/features/kosks/components/open-kosk-dialog";
import {
  approveKoskApplication,
  loadKoskApplication,
  loadKoskApplications,
  rejectKoskApplication,
} from "../actions";
import {
  failureKey,
  fieldLabel,
  isSettled,
  openFormFromApplication,
  phoneOrNull,
  type RequestTab,
} from "../present";

type Detail =
  | { state: "loading" }
  | { state: "failed" }
  | ({ state: "ready" } & KoskApplicationDetailResponse);

interface Props {
  /** the waiting applications and both counts; null when the first read failed */
  initial: KoskApplicationListResponse | null;
}

/**
 * Köşk başvuruları (nizam 15): what members sent from Tedris to open a köşk,
 * waiting and answered. The applicant's e-mail and phone are read only once an
 * application is selected, because tedrisat writes that read to the audit log
 * (the note under the contact lines says so). "Köşkü aç" opens the köşk form
 * filled with the application and accepts it when the köşk exists; "Reddet"
 * asks for a reason the applicant will read.
 */
export function ApplicationsView({ initial }: Props) {
  const t = useTranslations("nizam.KoskApplicationsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const fmt = { locale, timeZone };

  const [tab, setTab] = useState<RequestTab>("PENDING");
  const [lists, setLists] = useState<
    Partial<Record<RequestTab, KoskApplicationItemResponse[]>>
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
  const [detail, setDetail] = useState<Detail | null>(null);
  const [opening, setOpening] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const items = lists[tab] ?? [];
  const selected = items.find((a) => a.id === selectedId) ?? null;

  const load = useCallback(
    async (next: RequestTab) => {
      setLoading(true);
      let result: Awaited<ReturnType<typeof loadKoskApplications>> | null;
      try {
        result = await loadKoskApplications(next);
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

  const changeTab = (next: RequestTab) => {
    setTab(next);
    setSelectedId((lists[next] ?? [])[0]?.id ?? null);
    if (lists[next] === undefined) void load(next);
  };

  // The selected application with the applicant's contact details; reading
  // them is audited, so it happens once per selection and not before.
  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      return;
    }
    let current = true;
    setDetail({ state: "loading" });
    void loadKoskApplication(selectedId).then((result) => {
      if (!current) return;
      setDetail(
        result.success
          ? { state: "ready", ...result.data }
          : { state: "failed" }
      );
    });
    return () => {
      current = false;
    };
  }, [selectedId]);

  /** The application is answered: it leaves the waiting list and the next one is selected. */
  const settle = (id: string) => {
    const rest = (lists.PENDING ?? []).filter((a) => a.id !== id);
    setLists({ PENDING: rest });
    setCounts((c) => ({
      pending: Math.max(0, c.pending - 1),
      decided: c.decided + 1,
    }));
    setSelectedId(rest[0]?.id ?? null);
  };

  const fail = (body: unknown, id: string) => {
    if (isSettled(body)) settle(id);
    toast.error(t("answerFailed"), {
      description: t(failureKey(body) as never),
      duration: Number.POSITIVE_INFINITY,
    });
  };

  /** The köşk was opened from the form: the application is accepted with it. */
  const opened = async (name: string, koskId: string) => {
    if (!selected) return;
    const result = await approveKoskApplication(selected.id, koskId);
    if (!result.success) {
      fail(result.errorBody, selected.id);
      return;
    }
    toast.success(t("approved"), {
      description: t("approvedBody", { name }),
    });
    settle(selected.id);
  };

  const reject = async (reason: string): Promise<boolean> => {
    if (!selected) return false;
    const result = await rejectKoskApplication(selected.id, reason);
    if (!result.success) {
      fail(result.errorBody, selected.id);
      return isSettled(result.errorBody);
    }
    toast.success(t("rejected"), {
      description: t("rejectedBody", { name: selected.name }),
    });
    settle(selected.id);
    return true;
  };

  const listItem = (a: KoskApplicationItemResponse) => {
    const active = a.id === selectedId;
    return (
      <li key={a.id}>
        <button
          type="button"
          className="flex w-full items-start gap-3 rounded-surface p-3 text-start"
          style={
            active
              ? { background: "var(--background-color-selected, #eceefc)" }
              : undefined
          }
          aria-current={active ? "true" : undefined}
          data-testid="application-item"
          onClick={() => setSelectedId(a.id)}
        >
          <Avatar name={a.name} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">{a.name}</bdi>
            <span className="mds-caption">
              {fieldLabel(a.field)} ·{" "}
              <bdi>{a.applicantName ?? t("unknownPerson")}</bdi>
            </span>
            <span className="mds-caption">
              {shortDateTime(a.decidedAt ?? a.createdAt, fmt)}
              {tab === "DECIDED"
                ? ` · ${t(`outcome.${a.status}` as never)}`
                : ""}
            </span>
          </span>
        </button>
      </li>
    );
  };

  const contact = (d: KoskApplicationDetailResponse) => (
    <section className="flex flex-col gap-3" aria-labelledby="applicant-title">
      <h3 id="applicant-title" className="mds-h3">
        {t("applicant")}
      </h3>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <dt className="mds-caption">{t("applicantName")}</dt>
          <dd className="m-0 flex items-center gap-2">
            <Avatar name={d.applicant.name ?? "?"} decorative />
            <bdi>{d.applicant.name ?? t("unknownPerson")}</bdi>
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="mds-caption">{t("roles")}</dt>
          <dd className="m-0">
            {d.applicant.roles.length === 0
              ? t("noRoles")
              : d.applicant.roles
                  .map((role) => t(`roleNames.${role}` as never))
                  .join(", ")}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="mds-caption">{t("email")}</dt>
          <dd className="m-0 [overflow-wrap:anywhere]" dir="ltr">
            {d.applicant.email}
          </dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="mds-caption">{t("phone")}</dt>
          <dd className="m-0" dir="ltr" data-testid="applicant-phone">
            {phoneOrNull(d.applicant.phone) ?? t("phoneMissing")}
          </dd>
        </div>
      </dl>
      <p className="mds-caption">{t("contactNote")}</p>
    </section>
  );

  const detailPanel = () => {
    if (!selected) return null;
    const waiting = selected.status === "PENDING";
    return (
      <section
        aria-labelledby="application-title"
        className="flex min-w-0 flex-col gap-5 rounded-surface border border-neutral-subtle p-4 sm:p-6"
        data-testid="application-detail"
      >
        <header className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="mds-eyebrow">{t("detailEyebrow")}</span>
            <h2 id="application-title" className="mds-h2">
              <bdi>{selected.name}</bdi>
            </h2>
          </div>
          <Badge
            variant={
              waiting
                ? "warning"
                : selected.status === "APPROVED"
                  ? "success"
                  : "error"
            }
          >
            {t(`status.${selected.status}` as never)}
          </Badge>
        </header>

        {!detail || detail.state === "loading" ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Skeleton height="1.5rem" />
            <Skeleton height="6rem" />
          </div>
        ) : detail.state === "failed" ? (
          <Alert tone="error">{t("detailFailed")}</Alert>
        ) : (
          <>
            <dl className="grid gap-4 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <dt className="mds-caption">{t("field")}</dt>
                <dd className="m-0">{fieldLabel(detail.field)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="mds-caption">{t("sentAt")}</dt>
                <dd className="m-0">{longDateTime(detail.createdAt, fmt)}</dd>
              </div>
              <div className="flex flex-col gap-1">
                <dt className="mds-caption">{t("sameField")}</dt>
                <dd className="m-0" data-testid="same-field">
                  {detail.sameFieldKosks.length === 0
                    ? t("sameFieldNone")
                    : detail.sameFieldKosks.join(", ")}
                </dd>
              </div>
            </dl>
            <div className="flex flex-col gap-1">
              <span className="mds-caption">{t("summary")}</span>
              <p className="mds-reading">
                <bdi>{detail.summary}</bdi>
              </p>
            </div>
            <div className="flex flex-col gap-1">
              <span className="mds-caption">{t("reason")}</span>
              <p className="mds-reading">
                <bdi>{detail.reason}</bdi>
              </p>
            </div>
            <hr className="border-neutral-subtle" />
            {contact(detail)}
            <hr className="border-neutral-subtle" />
            {waiting ? (
              <>
                <p className="mds-caption max-w-[40rem]">{t("openNote")}</p>
                <div className="flex gap-3">
                  <Button onClick={() => setOpening(true)}>{t("open")}</Button>
                  <Button variant="outline" onClick={() => setRejecting(true)}>
                    {t("reject")}
                  </Button>
                </div>
              </>
            ) : detail.status === "REJECTED" && detail.rejectReason ? (
              <Alert tone="neutral" title={t("rejectReasonTitle")}>
                <bdi>{detail.rejectReason}</bdi>
              </Alert>
            ) : null}
          </>
        )}
      </section>
    );
  };

  const ready = detail?.state === "ready" ? detail : null;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="kosk-applications"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro")}</p>
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
            <div className="flex flex-col gap-3" aria-busy="true">
              {[0, 1, 2].map((n) => (
                <Skeleton key={n} height="4.5rem" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <EmptyState>{t(`empty.${tab}`)}</EmptyState>
          ) : (
            <div className="grid gap-grid lg:grid-cols-[22rem_minmax(0,1fr)]">
              <ul
                className="m-0 flex min-w-0 list-none flex-col gap-1 self-start rounded-surface border border-neutral-subtle p-2"
                data-testid="application-list"
              >
                {items.map(listItem)}
              </ul>
              {detailPanel()}
            </div>
          )}
        </div>
      )}

      <OpenKoskDialog
        open={opening}
        onOpenChange={setOpening}
        initial={ready ? openFormFromApplication(ready) : undefined}
        initialPeople={
          ready
            ? [
                {
                  id: ready.applicant.id,
                  name: ready.applicant.name ?? ready.applicant.email,
                  email: ready.applicant.email,
                },
              ]
            : undefined
        }
        onOpened={(name, koskId) => void opened(name, koskId)}
      />
      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        kind="application"
        subject={selected?.name ?? null}
        onSubmit={reject}
      />
    </div>
  );
}
