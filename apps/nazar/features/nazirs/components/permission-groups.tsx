"use client";

import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { GroupView } from "../permissions";
import { GroupDialog, type GroupTarget } from "./group-dialog";

/** One card of the list, already worded: the section has nothing to translate. */
export interface GroupCard {
  group: GroupView;
  /** the first few permissions as sentences, then how many more */
  summary: string;
  /** "2 izin · 1 nazıra verildi" */
  usage: string;
}

/**
 * "İzin grupları" under the roster (nazir 05, 16): the medrese's groups as
 * cards, "Grup tanımla" above them and "Düzenle" on each. The dialog for both
 * is opened from here, which is why this is a client component; once a group
 * is saved or deleted the page reads the roster and the groups again. Defining
 * or changing a group is giving permissions, so both buttons are drawn only
 * for whoever gives them, the başmüderris (MDRS-108).
 */
export function PermissionGroups({
  madrasahId,
  madrasahName,
  cards,
  manages,
}: {
  madrasahId: string;
  madrasahName: string;
  cards: GroupCard[];
  manages: boolean;
}) {
  const t = useTranslations("nazar");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [target, setTarget] = useState<GroupTarget | null>(null);

  return (
    <section
      aria-labelledby="groups-heading"
      className="flex flex-col gap-4"
      data-testid="permission-groups"
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="mds-h2" id="groups-heading">
            {t("Groups.title")}
          </h2>
          <p className="mds-body-sm text-neutral-muted">{t("Groups.intro")}</p>
        </div>
        {manages ? (
          <Button
            variant="secondary"
            iconLeft={<Icon name="plus" size="sm" />}
            onClick={() => setTarget({ mode: "create" })}
          >
            {t("Groups.define")}
          </Button>
        ) : null}
      </header>
      {cards.length === 0 ? (
        <EmptyState>{t("Groups.empty")}</EmptyState>
      ) : (
        <ul className="mds-card flex flex-col p-0">
          {cards.map(({ group, summary, usage }) => (
            <li
              key={group.id}
              className="flex items-center gap-4 px-card py-4 border-be border-neutral-subtle last:border-be-0"
              data-testid="permission-group"
            >
              <Icon name="group" size="md" />
              <span className="flex min-inline-0 grow flex-col gap-1">
                <bdi className="font-semibold text-neutral-default">
                  {group.name}
                </bdi>
                <span className="mds-body-sm text-neutral-muted">
                  {summary}
                </span>
                <span className="mds-caption">{usage}</span>
              </span>
              {manages ? (
                <Button
                  variant="ghost"
                  size="small"
                  aria-label={t("Groups.editLabel", { name: group.name })}
                  onClick={() => setTarget({ mode: "edit", group })}
                >
                  {t("Groups.edit")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <GroupDialog
        madrasahId={madrasahId}
        madrasahName={madrasahName}
        target={target}
        onClose={() => setTarget(null)}
        onDone={() => startTransition(() => router.refresh())}
      />
    </section>
  );
}
