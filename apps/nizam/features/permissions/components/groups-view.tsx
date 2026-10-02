"use client";

import type {
  GroupUserResponse,
  MedarisNazimResponse,
  PermissionCatalogResponse,
  PermissionGroupResponse,
} from "@medaris/services/tedrisat";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "../present";
import { GroupForm } from "./group-form";
import { PermissionsDialog } from "./permissions-dialog";

interface Props {
  /** null when the first read failed */
  groups: PermissionGroupResponse[] | null;
  catalog: PermissionCatalogResponse | null;
  nazims: MedarisNazimResponse[] | null;
  /** the selected group's id, or "new" */
  selected: string | "new";
  /** the people who hold the selected group */
  users: GroupUserResponse[] | null;
}

/**
 * İzin grupları (nizam 13): the groups on the left, the selected one's form on
 * the right. The selection is the URL (`?grup=<id>`, or `?grup=yeni`), so a
 * group can be linked to and the server reads its users with it. "İzinlerini
 * düzenle" on a user opens nizam/12 for that person.
 */
export function GroupsView({
  groups,
  catalog,
  nazims,
  selected,
  users,
}: Props) {
  const tm = useTranslations("nizam.GroupsPage");
  const t = tm as unknown as Messages;
  const locale = useLocale();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [editing, setEditing] = useState<MedarisNazimResponse | null>(null);

  const retry = () => startTransition(() => router.refresh());
  const base = `/${locale}/izin-gruplari`;
  const group =
    groups && selected !== "new"
      ? (groups.find((g) => g.id === selected) ?? null)
      : null;

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="groups"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex max-w-[60rem] flex-col gap-3">
          <h1 className="mds-h1">{t("title")}</h1>
          <p>{t("intro")}</p>
        </div>
        <Button
          href={`${base}?grup=yeni`}
          iconLeft={<Icon name="plus" size="sm" />}
        >
          {t("create")}
        </Button>
      </header>

      {groups === null || catalog === null || nazims === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button variant="outline" size="small" onClick={retry}>
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <div className="grid gap-6 md:grid-cols-[18rem_minmax(0,1fr)]">
          <nav aria-label={t("listLabel")} className="mds-card h-fit p-2">
            <h2 className="mds-visually-hidden">{t("listHeading")}</h2>
            {groups.length === 0 ? (
              <p className="mds-caption p-3">{t("listEmpty")}</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {groups.map((g) => {
                  const current = g.id === selected;
                  return (
                    <li key={g.id}>
                      <Link
                        href={`${base}?grup=${g.id}`}
                        aria-current={current ? "page" : undefined}
                        className="flex items-center gap-3 rounded-control p-3 text-neutral-default no-underline aria-[current=page]:bg-brand-subtle"
                        data-testid="group-item"
                      >
                        <Icon name="key" size="sm" />
                        <span className="flex min-w-0 grow flex-col">
                          <bdi className="font-semibold">{g.name}</bdi>
                          <span className="mds-caption">
                            {t("itemLine", {
                              scope: t(`scope.${g.scope}.short`),
                              count: g.permissions.length,
                            })}
                          </span>
                        </span>
                        {g.userCount > 0 ? (
                          <span
                            className="mds-badge mds-badge--secondary"
                            role="img"
                            aria-label={t("usedBy", { count: g.userCount })}
                          >
                            {g.userCount}
                          </span>
                        ) : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </nav>

          {selected !== "new" && group === null ? (
            <Alert tone="warning" title={t("missingTitle")}>
              <p>{t("missing")}</p>
            </Alert>
          ) : (
            <GroupForm
              key={group?.id ?? "new"}
              group={group}
              groups={groups}
              catalog={catalog}
              users={users}
              nazims={nazims}
              onEditUser={setEditing}
            />
          )}
        </div>
      )}

      {catalog && groups ? (
        <PermissionsDialog
          open={editing !== null}
          onOpenChange={(open) => {
            if (!open) setEditing(null);
          }}
          nazim={editing}
          catalog={catalog}
          groups={groups}
          onSaved={retry}
        />
      ) : null}
    </div>
  );
}
