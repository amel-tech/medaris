"use client";

import type {
  KoskGrantResponse,
  KoskGrantsResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useEffect, useMemo, useState, useTransition } from "react";
import { dismissOpen, endLabel, formatDay } from "../../permissions/present";
import {
  courseCodeKey,
  freeCourses,
  type Messages,
  madrasahCourseNote,
  permissionSummary,
} from "../present";
import { GrantDialog } from "./grant-dialog";
import { RevokeDialog } from "./revoke-dialog";

interface Props {
  koskId: string;
  /** null when the first read failed */
  data: KoskGrantsResponse | null;
  /** the viewer's id, to write "(siz)" after their own name */
  viewerId: string | null;
}

/**
 * İzinler (nizam 38): the ders nazırları of the köşk's medrese-free courses
 * with their permissions, end and giver. "Ders nazırı ata" and "İzinleri
 * düzenle" open the grant dialog; "Görevden al" the dismissal. The last stays
 * shut until the version gate of 4 Ekim 2026 (decided on the viewer's clock;
 * the screen never says why). A medrese's courses are named in a note: their
 * permissions come from the medrese's staff.
 */
export function GrantsView({ koskId, data, viewerId }: Props) {
  const tm = useTranslations("nizam.KoskGrantsPage");
  const t = tm as unknown as Messages;
  const tc = useTranslations("nizam.PermissionCatalog");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [assigning, setAssigning] = useState(false);
  const [editing, setEditing] = useState<KoskGrantResponse | null>(null);
  const [revoking, setRevoking] = useState<KoskGrantResponse | null>(null);
  // Read on the client after mounting, so server and browser agree while hydrating.
  const [gateOpen, setGateOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const at = Date.now();
    setNow(new Date(at));
    setGateOpen(dismissOpen(at));
  }, []);

  const refresh = () => startTransition(() => router.refresh());
  const free = useMemo(() => freeCourses(data?.courses ?? []), [data]);
  const medrese = useMemo(
    () => madrasahCourseNote(data?.courses ?? []),
    [data]
  );
  const order = data?.grantable ?? [];
  // The short name of a permission ("celseler"), not its sentence: the
  // sentences stay in the dialog, the column only sums them up (nizam/38).
  const nameOf = (code: string) =>
    tc(`courseShort.${courseCodeKey(code)}` as never);
  const sentence = (text: string) =>
    text ? text.charAt(0).toLocaleUpperCase(locale) + text.slice(1) : text;
  const list = (items: string[]) => {
    try {
      return new Intl.ListFormat(locale, {
        style: "long",
        type: "conjunction",
      }).format(items);
    } catch {
      return items.join(", ");
    }
  };

  const columns: TableColumn<KoskGrantResponse>[] = [
    {
      key: "person",
      header: t("columns.person"),
      rowHeader: true,
      width: "21%",
      render: (g) => (
        <span className="flex min-w-0 items-center gap-3">
          <Avatar name={g.user.name ?? g.user.email ?? ""} decorative />
          <span className="flex min-w-0 flex-col">
            <bdi className="font-semibold">
              {g.user.name ?? t("unknownPerson")}
            </bdi>
            {g.user.email ? (
              <bdi dir="ltr" className="mds-caption break-all font-mono">
                {g.user.email}
              </bdi>
            ) : null}
          </span>
        </span>
      ),
    },
    {
      key: "course",
      header: t("columns.course"),
      width: "13%",
      render: (g) => <bdi>{g.course.title}</bdi>,
    },
    {
      key: "permissions",
      header: t("columns.permissions"),
      width: "24%",
      render: (g) => {
        const sum = permissionSummary(g.permissions, order, nameOf);
        return (
          <span className="flex flex-col">
            <span data-testid="permission-count">
              {t("permissionCount", { count: sum.count })}
            </span>
            {sum.names ? (
              <span className="mds-caption" data-testid="permission-names">
                {sentence(sum.names)}
              </span>
            ) : null}
          </span>
        );
      },
    },
    {
      key: "end",
      header: t("columns.end"),
      width: "12%",
      render: (g) => {
        const label = endLabel(g.endsAt ?? null, now ?? new Date(), {
          locale,
          timeZone,
        });
        if (label.kind === "never") {
          return <span className="mds-caption">{t("never")}</span>;
        }
        return (
          <span className="flex flex-col">
            <span>{label.date}</span>
            <span className="mds-caption">{t("sameDay")}</span>
          </span>
        );
      },
    },
    {
      key: "giver",
      header: t("columns.giver"),
      width: "16%",
      render: (g) => (
        <span className="flex flex-col">
          <bdi>
            {g.grantedBy.name ?? t("unknownPerson")}
            {viewerId && g.grantedBy.id === viewerId ? ` ${t("you")}` : ""}
          </bdi>
          <span className="mds-caption">
            {formatDay(g.grantedAt, locale, timeZone)}
          </span>
        </span>
      ),
    },
    {
      key: "actions",
      header: (
        <span className="mds-visually-hidden">{t("columns.actions")}</span>
      ),
      align: "right",
      width: "14%",
      render: (g) => (
        <span className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="small"
            aria-label={t("editLabel", { name: g.user.name ?? "" })}
            onClick={() => setEditing(g)}
          >
            {t("edit")}
          </Button>
          <Button
            variant="ghost"
            size="small"
            disabled={!gateOpen}
            aria-label={t("revokeLabel", { name: g.user.name ?? "" })}
            onClick={() => setRevoking(g)}
          >
            {t("revoke")}
          </Button>
        </span>
      ),
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="grants"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-w-[44rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <Button
          iconLeft={<Icon name="plus" size="sm" />}
          disabled={data === null}
          onClick={() => setAssigning(true)}
        >
          {t("assign")}
        </Button>
      </header>

      {medrese.titles.length > 0 ? (
        <Alert tone="neutral" data-testid="madrasah-note">
          <p>
            {t("madrasahNote", {
              courses: list(medrese.titles),
              madrasahs: list(medrese.madrasahs),
              count: medrese.titles.length,
            })}
          </p>
        </Alert>
      ) : null}

      <section aria-labelledby="grants-heading" className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="grants-heading" className="mds-h2">
            {t("heading")}
          </h2>
          {data ? (
            <span className="mds-caption" data-testid="grant-count">
              {t("count", { count: data.items.length })}
            </span>
          ) : null}
        </div>
        {data === null ? (
          <Alert tone="error" title={t("loadFailedTitle")}>
            <p>{t("loadFailed")}</p>
            <Button variant="outline" size="small" onClick={refresh}>
              {t("retry")}
            </Button>
          </Alert>
        ) : (
          <Table
            caption={t("caption")}
            columns={columns}
            rows={data.items}
            rowKey={(g) => g.id}
            empty={t("empty")}
            responsive="stack"
          />
        )}
      </section>

      {data ? (
        <>
          <GrantDialog
            open={assigning}
            onOpenChange={setAssigning}
            koskId={koskId}
            grant={null}
            courses={free}
            grantable={data.grantable}
            onSaved={refresh}
          />
          <GrantDialog
            open={editing !== null}
            onOpenChange={(open) => {
              if (!open) setEditing(null);
            }}
            koskId={koskId}
            grant={editing}
            courses={free}
            grantable={data.grantable}
            onSaved={refresh}
          />
        </>
      ) : null}
      <RevokeDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        koskId={koskId}
        grant={revoking}
        onRevoked={refresh}
      />
    </div>
  );
}
