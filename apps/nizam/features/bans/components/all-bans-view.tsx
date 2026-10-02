"use client";

import type {
  AllBansListResponse,
  BanResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { ChoiceChips } from "@medaris/ui/mds/choice-chips";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import { hiddenAtLabel } from "~/features/archive/present";
import { loadAllBans } from "../actions";
import {
  asScopeFilter,
  bannerRole,
  cannotLiftNote,
  isRecent,
  type Messages,
  nextOffset,
  rowActions,
  type ScopeFilter,
  scopeParts,
} from "../present";
import { ExtendDialog, type ExtendTarget } from "./extend-dialog";
import { LiftDialog, type LiftTarget } from "./lift-dialog";

type Status = "ACTIVE" | "LIFTED";

const ALL = "ALL";
const SEARCH_DELAY_MS = 300;

interface Props {
  /** null when the first read failed */
  initial: AllBansListResponse | null;
  /** the signed-in person, for "(siz)" */
  viewerId: string | null;
  /** how the viewer is called in the lift dialog's info line */
  viewerRoleLabel: string;
}

interface Query {
  status: Status;
  scope: ScopeFilter;
  q: string;
}

/**
 * Yasaklamalar for Medaris administration (nizam 48): every köşk's bans, with
 * a scope filter, a search and "Daha fazla göster". The scopes that exist are
 * the ones the model has — Ders and Köşk; Medrese and Platform chips wait for
 * bans of those scopes (nizam 49 draws "Platformdan yasakla"). "Yasağı
 * kaldır" and "Yasağı genişlet" are offered where the server's per-row flags
 * say so; the device events tab waits for a device-trace backend and is not
 * drawn.
 */
export function AllBansView({ initial, viewerId, viewerRoleLabel }: Props) {
  const tm = useTranslations("nizam.BansPage");
  const t = tm as unknown as Messages;
  const ta = useTranslations("nizam.AllBansPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const [query, setQuery] = useState<Query>({
    status: "ACTIVE",
    scope: "",
    q: "",
  });
  const [typed, setTyped] = useState("");
  const [items, setItems] = useState<BanResponse[]>(initial?.items ?? []);
  const [total, setTotal] = useState(initial?.total ?? 0);
  const [counts, setCounts] = useState({
    active: initial?.activeCount ?? 0,
    lifted: initial?.liftedCount ?? 0,
    recent: initial?.recentCount ?? 0,
  });
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [more, setMore] = useState(false);
  const [lifting, setLifting] = useState<LiftTarget | null>(null);
  const [extending, setExtending] = useState<ExtendTarget | null>(null);
  // Answers of an older query must not overwrite a newer one.
  const ticket = useRef(0);

  const load = useCallback(
    async (next: Query, offset = 0) => {
      const mine = ++ticket.current;
      if (offset === 0) setLoading(true);
      else setMore(true);
      let result: Awaited<ReturnType<typeof loadAllBans>> | null = null;
      try {
        result = await loadAllBans({
          status: next.status,
          scope: next.scope || undefined,
          q: next.q,
          offset,
        });
      } catch {
        result = null;
      }
      if (mine !== ticket.current) return;
      setLoading(false);
      setMore(false);
      if (!result?.success) {
        setFailed(true);
        toast.error(t("loadFailedTitle"), {
          description: t("loadFailed"),
          duration: Number.POSITIVE_INFINITY,
        });
        return;
      }
      const page = result.data;
      setFailed(false);
      setItems((current) =>
        offset === 0 ? page.items : [...current, ...page.items]
      );
      setTotal(page.total);
      setCounts({
        active: page.activeCount,
        lifted: page.liftedCount,
        recent: page.recentCount,
      });
    },
    [t]
  );

  // The search waits for a pause in typing; the first render shows the page
  // the server already read.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    const timer = setTimeout(() => {
      setQuery((current) =>
        current.q === typed.trim() ? current : { ...current, q: typed.trim() }
      );
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [typed]);

  const seen = useRef(query);
  useEffect(() => {
    if (seen.current === query) return;
    seen.current = query;
    void load(query);
  }, [query, load]);

  const now = new Date();
  const when = (at: Date | string | null) =>
    at ? hiddenAtLabel(new Date(at), now, { locale, timeZone, t }) : "";

  const nameOf = (ban: BanResponse) =>
    ban.user.name ?? ban.user.email ?? t("unknownPerson");

  const startLift = (ban: BanResponse) => {
    const koskName = ban.koskName ?? "";
    const scope = scopeParts(ban, koskName, t, true);
    const role = bannerRole(ban, viewerId, t);
    setLifting({
      banId: ban.id,
      name: nameOf(ban),
      email: ban.user.email,
      courseTitle: ban.courseTitle ?? ban.extendedFromCourseTitle,
      summary: {
        scope: [scope.label, ...scope.detail.slice(0, 2)].join(" · "),
        bannedBy: `${ban.bannedBy.name ?? t("unknownPerson")}, ${role.toLocaleLowerCase(locale)}`,
        bannedAt: when(ban.createdAt),
        reason: ban.reason,
        role: role.toLocaleLowerCase(locale),
        rolePhrase: t(`rolePhrases.${ban.bannedRole}`),
      },
    });
  };

  const startExtend = (ban: BanResponse) =>
    setExtending({
      banId: ban.id,
      name: nameOf(ban),
      email: ban.user.email,
      courseTitle: ban.courseTitle,
      koskName: ban.koskName ?? "",
    });

  const refresh = () => void load(query);

  const personCell = (ban: BanResponse) => (
    <span className="flex min-w-0 items-center gap-3">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex flex-wrap items-center gap-2">
          <bdi>{nameOf(ban)}</bdi>
          {query.status === "ACTIVE" && isRecent(ban, now) ? (
            <Badge variant="info">{t("new")}</Badge>
          ) : null}
        </span>
        {ban.user.email ? (
          <bdi
            dir="ltr"
            title={ban.user.email}
            className="mds-caption block max-w-full font-mono [overflow-wrap:anywhere]"
          >
            {ban.user.email}
          </bdi>
        ) : null}
      </span>
    </span>
  );

  const columns: TableColumn<BanResponse>[] = [
    {
      key: "person",
      header: t("columns.person"),
      rowHeader: true,
      width: "24%",
      render: personCell,
    },
    {
      key: "scope",
      header: t("columns.scope"),
      width: "15%",
      render: (ban) => {
        const scope = scopeParts(ban, ban.koskName ?? "", t, true);
        return (
          <span className="flex flex-col">
            <span>{scope.label}</span>
            {scope.detail.map((line) => (
              <bdi key={line} className="mds-caption">
                {line}
              </bdi>
            ))}
          </span>
        );
      },
    },
    {
      key: "reason",
      header: t("columns.reason"),
      width: "17%",
      render: (ban) => <bdi>{ban.reason}</bdi>,
    },
    {
      key: "bannedBy",
      header: t("columns.bannedBy"),
      width: "11%",
      render: (ban) => (
        <span className="flex flex-col">
          <bdi>{ban.bannedBy.name ?? t("unknownPerson")}</bdi>
          <span className="mds-caption">{bannerRole(ban, viewerId, t)}</span>
        </span>
      ),
    },
    {
      key: "when",
      header: t("columns.when"),
      width: "9%",
      render: (ban) => (
        <span className="whitespace-nowrap">{when(ban.createdAt)}</span>
      ),
    },
    query.status === "ACTIVE"
      ? {
          key: "actions",
          header: (
            <span className="mds-visually-hidden">{t("columns.actions")}</span>
          ),
          align: "right",
          width: "24%",
          render: (ban) => {
            const actions = rowActions(ban);
            const name = nameOf(ban);
            return (
              <span className="flex flex-col items-end gap-2">
                {actions.lift ? (
                  <Button
                    variant="outline"
                    size="small"
                    aria-label={t("liftLabel", { name })}
                    onClick={() => startLift(ban)}
                  >
                    {t("lift")}
                  </Button>
                ) : (
                  <span className="mds-caption text-end">
                    {cannotLiftNote(ban, t)}
                  </span>
                )}
                {actions.extend ? (
                  <Button
                    variant="ghost"
                    size="small"
                    aria-label={ta("extendLabel", { name })}
                    onClick={() => startExtend(ban)}
                  >
                    {ta("extend")}
                  </Button>
                ) : null}
              </span>
            );
          },
        }
      : {
          key: "liftedBy",
          header: t("columns.liftedBy"),
          width: "24%",
          render: (ban) => (
            <span className="flex flex-col">
              <bdi>{ban.liftedBy?.name ?? t("unknownPerson")}</bdi>
              <span className="mds-caption">{when(ban.liftedAt)}</span>
              {ban.liftReason ? (
                <bdi className="mds-caption">{ban.liftReason}</bdi>
              ) : null}
            </span>
          ),
        },
  ];

  const filtered = query.scope !== "" || query.q !== "";
  const next = nextOffset(items.length, total);
  const table = (
    <div className="flex flex-col gap-4">
      <p className="mds-caption" data-testid="all-bans-summary">
        {ta(`summary.${query.status}`, { count: total })}
      </p>
      <Table
        caption={ta(`caption.${query.status}`)}
        columns={columns}
        rows={items}
        rowKey={(ban) => ban.id}
        empty={filtered ? ta("emptyFiltered") : t(`empty.${query.status}`)}
        responsive="stack"
      />
      {next !== null ? (
        <div className="flex justify-end">
          <Button
            variant="ghost"
            loading={more}
            onClick={() => void load(query, next)}
          >
            {ta("more")}
          </Button>
        </div>
      ) : null}
    </div>
  );

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="all-bans"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{ta("intro")}</p>
      </header>

      <section
        aria-labelledby="all-bans-heading"
        className="flex flex-col gap-4"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="all-bans-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {counts.recent > 0 ? (
            <p className="mds-caption" data-testid="all-bans-recent">
              {t("recent", { count: counts.recent })}
            </p>
          ) : null}
        </div>

        <Tabs
          label={t("tabsLabel")}
          locale={locale}
          value={query.status}
          onChange={(value) =>
            setQuery((current) => ({ ...current, status: value as Status }))
          }
          tabs={[
            { value: "ACTIVE", label: t("tabs.ACTIVE"), count: counts.active },
            {
              value: "LIFTED",
              label: t("tabs.LIFTED"),
              count: counts.lifted,
            },
          ]}
        >
          {(["ACTIVE", "LIFTED"] as const).map((value) => (
            <TabsPanel
              key={value}
              value={value}
              className="flex flex-col gap-4 pbs-4"
            >
              {value !== query.status ? null : (
                <>
                  <div className="max-w-[28rem]">
                    <Field>
                      <Input
                        type="search"
                        name="q"
                        aria-label={ta("searchLabel")}
                        placeholder={ta("searchPlaceholder")}
                        leading={<Icon name="search" size="sm" />}
                        value={typed}
                        autoComplete="off"
                        onChange={(e) => setTyped(e.target.value)}
                      />
                    </Field>
                  </div>
                  <ChoiceChips
                    legend={ta("scopeLegend")}
                    legendVisible
                    options={[
                      { value: ALL, label: ta("scopeAll") },
                      { value: "COURSE", label: t("scope.COURSE") },
                      { value: "KOSK", label: t("scope.KOSK") },
                    ]}
                    value={query.scope === "" ? ALL : query.scope}
                    onChange={(chosen) =>
                      setQuery((current) => ({
                        ...current,
                        scope: asScopeFilter(
                          !chosen || chosen === ALL ? "" : chosen
                        ),
                      }))
                    }
                  />
                  {failed ? (
                    <Alert tone="error" title={t("loadFailedTitle")}>
                      <p>{t("loadFailed")}</p>
                      <Button variant="outline" size="small" onClick={refresh}>
                        {t("retry")}
                      </Button>
                    </Alert>
                  ) : loading ? (
                    <div aria-busy="true" className="flex flex-col gap-3">
                      <span className="mds-visually-hidden">
                        {t("loading")}
                      </span>
                      {[0, 1, 2].map((row) => (
                        <Skeleton key={row} height="3rem" />
                      ))}
                    </div>
                  ) : (
                    table
                  )}
                </>
              )}
            </TabsPanel>
          ))}
        </Tabs>
      </section>

      <LiftDialog
        open={lifting !== null}
        onOpenChange={(open) => {
          if (!open) setLifting(null);
        }}
        target={lifting}
        viewerRole={viewerRoleLabel}
        onLifted={() => {
          setLifting(null);
          refresh();
        }}
      />
      <ExtendDialog
        open={extending !== null}
        onOpenChange={(open) => {
          if (!open) setExtending(null);
        }}
        target={extending}
        onExtended={() => {
          setExtending(null);
          refresh();
        }}
      />
    </div>
  );
}
