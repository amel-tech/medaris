"use client";

import type { BanListResponse, BanResponse } from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { Tabs, TabsPanel } from "@medaris/ui/mds/tabs";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useCallback, useState } from "react";
import { hiddenAtLabel } from "~/features/archive/present";
import { createBan, loadKoskBans } from "../actions";
import {
  banErrorKey,
  bannerRole,
  cannotLiftNote,
  isRecent,
  type Messages,
  scopeParts,
} from "../present";
import { LiftDialog, type LiftTarget } from "./lift-dialog";

type Status = "ACTIVE" | "LIFTED";

interface Props {
  koskId: string;
  koskName: string;
  /** null when the first read failed */
  initial: BanListResponse | null;
  /** the signed-in person, for "(siz)" */
  viewerId: string | null;
  /** how the viewer is called in the lift dialog's info line */
  viewerRoleLabel: string;
}

/**
 * Yasaklamalar (nizam 42): the köşk's bans, active and lifted, with the
 * reason, who barred and when. "Yasağı kaldır" opens a dialog for the reason
 * and is offered only where the viewer's kademe reaches the ban's (the server
 * decides, per row); "Köşkten de yasakla" widens a course ban to the köşk.
 * The device events tab of the design waits for a device-trace backend and is
 * not drawn.
 */
export function BansView({
  koskId,
  koskName,
  initial,
  viewerId,
  viewerRoleLabel,
}: Props) {
  const tm = useTranslations("nizam.BansPage");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const [status, setStatus] = useState<Status>("ACTIVE");
  const [lists, setLists] = useState<Partial<Record<Status, BanResponse[]>>>({
    ACTIVE: initial?.items,
  });
  const [counts, setCounts] = useState({
    active: initial?.activeCount ?? 0,
    lifted: initial?.liftedCount ?? 0,
    recent: initial?.recentCount ?? 0,
  });
  const [failed, setFailed] = useState(initial === null);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lifting, setLifting] = useState<{
    ban: BanResponse;
    target: LiftTarget;
  } | null>(null);

  const load = useCallback(
    async (next: Status) => {
      setLoading(true);
      const result = await loadKoskBans(koskId, next);
      setLoading(false);
      if (!result.success) {
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
        active: result.data.activeCount,
        lifted: result.data.liftedCount,
        recent: result.data.recentCount,
      });
    },
    [koskId, t]
  );

  const changeStatus = (next: Status) => {
    setStatus(next);
    void load(next);
  };

  const now = new Date();
  const when = (at: Date | string | null) =>
    at ? hiddenAtLabel(new Date(at), now, { locale, timeZone, t }) : "";

  const startLift = (ban: BanResponse) => {
    const scope = scopeParts(ban, koskName, t);
    const role = bannerRole(ban, viewerId, t);
    setLifting({
      ban,
      target: {
        banId: ban.id,
        name: ban.user.name ?? ban.user.email ?? t("unknownPerson"),
        email: ban.user.email,
        courseTitle: ban.courseTitle ?? ban.extendedFromCourseTitle,
        summary: {
          scope: [scope.label, ...scope.detail.slice(0, 1)].join(" · "),
          bannedBy: ban.bannedBy.name ?? t("unknownPerson"),
          bannedAt: when(ban.createdAt),
          reason: ban.reason,
          role: role.toLocaleLowerCase(locale),
        },
      },
    });
  };

  const extend = async (ban: BanResponse) => {
    if (!ban.courseId) return;
    setBusyId(ban.id);
    const result = await createBan({
      courseId: ban.courseId,
      userId: ban.user.id,
      scope: "KOSK",
      reason: ban.reason,
    });
    setBusyId(null);
    if (!result.success) {
      toast.error(t("extendFailed"), {
        description: t(banErrorKey(result.errorBody)),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    toast.success(t("extended"), {
      description: t("extendedBody", {
        name: ban.user.name ?? ban.user.email ?? "",
        kosk: koskName,
      }),
    });
    void load(status);
  };

  const personCell = (ban: BanResponse) => (
    <span className="flex items-center gap-3">
      <Avatar name={ban.user.name ?? ban.user.email ?? ""} decorative />
      <span className="flex min-w-0 flex-col">
        <span className="flex items-center gap-2">
          <bdi className="font-semibold">
            {ban.user.name ?? ban.user.email ?? t("unknownPerson")}
          </bdi>
          {status === "ACTIVE" && isRecent(ban, now) ? (
            <Badge variant="info">{t("new")}</Badge>
          ) : null}
        </span>
        {ban.user.email ? (
          <bdi dir="ltr" className="mds-caption font-mono">
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
      render: personCell,
    },
    {
      key: "scope",
      header: t("columns.scope"),
      render: (ban) => {
        const scope = scopeParts(ban, koskName, t);
        return (
          <span className="flex flex-col">
            <span>{scope.label}</span>
            {scope.detail.length > 0 ? (
              <bdi className="mds-caption">{scope.detail.join(" · ")}</bdi>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "reason",
      header: t("columns.reason"),
      render: (ban) => <bdi>{ban.reason}</bdi>,
    },
    {
      key: "bannedBy",
      header: t("columns.bannedBy"),
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
      render: (ban) => when(ban.createdAt),
    },
    status === "ACTIVE"
      ? {
          key: "actions",
          header: (
            <span className="mds-visually-hidden">{t("columns.actions")}</span>
          ),
          align: "right",
          render: (ban) => {
            const name = ban.user.name ?? ban.user.email ?? "";
            return (
              <span className="flex flex-col items-end gap-2">
                <span className="flex flex-wrap justify-end gap-2">
                  {ban.viewerMayLift ? (
                    <Button
                      variant="outline"
                      size="small"
                      aria-label={t("liftLabel", { name })}
                      onClick={() => startLift(ban)}
                    >
                      {t("lift")}
                    </Button>
                  ) : null}
                  {ban.viewerMayExtend ? (
                    <Button
                      variant="ghost"
                      size="small"
                      loading={busyId === ban.id}
                      aria-label={t("extendLabel", { name })}
                      onClick={() => void extend(ban)}
                    >
                      {t("extend")}
                    </Button>
                  ) : null}
                </span>
                {ban.viewerMayLift ? null : (
                  <span className="mds-caption text-end">
                    {cannotLiftNote(ban, t)}
                  </span>
                )}
              </span>
            );
          },
        }
      : {
          key: "liftedBy",
          header: t("columns.liftedBy"),
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

  const rows = lists[status] ?? [];
  const table = (
    <Table
      caption={t(`caption.${status}`, { kosk: koskName })}
      columns={columns}
      rows={rows}
      rowKey={(ban) => ban.id}
      empty={t(`empty.${status}`)}
      responsive="stack"
    />
  );

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="bans"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro", { kosk: koskName })}</p>
      </header>

      <section aria-labelledby="bans-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="bans-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {counts.recent > 0 ? (
            <p className="mds-caption" data-testid="bans-recent">
              {t("recent", { count: counts.recent })}
            </p>
          ) : null}
        </div>

        <Tabs
          label={t("tabsLabel")}
          locale={locale}
          value={status}
          onChange={(v) => changeStatus(v as Status)}
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
            <TabsPanel key={value} value={value} className="pbs-4">
              {value !== status ? null : failed ? (
                <Alert tone="error" title={t("loadFailedTitle")}>
                  <p>{t("loadFailed")}</p>
                  <Button
                    variant="outline"
                    size="small"
                    onClick={() => void load(status)}
                  >
                    {t("retry")}
                  </Button>
                </Alert>
              ) : loading && lists[status] === undefined ? (
                <div aria-busy="true" className="flex flex-col gap-3">
                  <span className="mds-visually-hidden">{t("loading")}</span>
                  {[0, 1, 2].map((row) => (
                    <Skeleton key={row} height="3rem" />
                  ))}
                </div>
              ) : (
                table
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
        target={lifting?.target ?? null}
        viewerRole={viewerRoleLabel}
        onLifted={() => {
          setLifting(null);
          setLists({});
          void load(status);
        }}
      />
    </div>
  );
}
