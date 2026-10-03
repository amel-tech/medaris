"use client";

import type {
  PlatformPolicyKey,
  PlatformPolicyListResponse,
  PlatformPolicyResponse,
  ScopedPolicyListResponse,
} from "@medaris/services/tedrisat";
import { toast } from "@medaris/ui/components/sonner";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Switch } from "@medaris/ui/mds/switch";
import { Table, type TableColumn } from "@medaris/ui/mds/table";
import { useRouter } from "next/navigation";
import { useLocale, useTimeZone, useTranslations } from "next-intl";
import { useState } from "react";
import { shortDateTime } from "~/features/deck-review/present";
import { setPlatformPolicy } from "../actions";
import { failureKey, withPolicy } from "../present";

type Scoped = ScopedPolicyListResponse["items"][number];

interface Props {
  /** null when the first read failed */
  initial: {
    policies: PlatformPolicyListResponse;
    scoped: ScopedPolicyListResponse;
  } | null;
}

const STEPS = [
  "roleDefault",
  "platform",
  "kosk",
  "madrasah",
  "course",
] as const;

/**
 * Platform ayarları (nizam 19): the platform-wide policies as switches that
 * take effect at once and are written to the audit log, the five steps by
 * which a rule narrows toward a course, and a read-only table of the rules
 * köşks apply on their own. A switch moves the moment it is pressed and moves
 * back, with a toast, if the server refuses.
 */
export function PoliciesView({ initial }: Props) {
  const router = useRouter();
  const t = useTranslations("nizam.PlatformSettingsPage");
  const locale = useLocale();
  const timeZone = useTimeZone() ?? "Europe/Istanbul";

  const [items, setItems] = useState<PlatformPolicyResponse[]>(
    initial?.policies.items ?? []
  );
  const [busy, setBusy] = useState<string | null>(null);
  // `initial` is a fresh server read after router.refresh() ("Tekrar dene"):
  // the state seeded from the first render must follow it.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) {
    setSeen(initial);
    setItems(initial?.policies.items ?? []);
  }

  const toggle = async (key: string, enabled: boolean) => {
    const before = items;
    setItems(withPolicy(items, key, enabled));
    setBusy(key);
    const result = await setPlatformPolicy(key as PlatformPolicyKey, enabled);
    setBusy(null);
    if (!result.success) {
      setItems(before);
      toast.error(t("saveFailed"), {
        description: t(failureKey(result.errorBody) as never),
        duration: Number.POSITIVE_INFINITY,
      });
      return;
    }
    setItems(result.data.items);
    toast.success(t(enabled ? "turnedOn" : "turnedOff"), {
      description: t(`policies.${key}.title` as never),
    });
  };

  const columns: TableColumn<Scoped>[] = [
    {
      key: "scope",
      header: t("columns.scope"),
      rowHeader: true,
      render: (s) => (
        <span className="flex flex-col">
          <bdi>{s.scope.name}</bdi>
          <span className="mds-caption">
            {t(`scopeKinds.${s.scope.kind}` as never)}
          </span>
        </span>
      ),
    },
    {
      key: "policy",
      header: t("columns.policy"),
      render: (s) => t(`policies.${s.key}.title` as never),
    },
    {
      key: "by",
      header: t("columns.by"),
      render: (s) =>
        s.openedBy ? (
          <bdi>{s.openedBy.name ?? t("unknownPerson")}</bdi>
        ) : (
          t("unknownBy")
        ),
    },
    {
      key: "at",
      header: t("columns.at"),
      render: (s) =>
        s.openedAt ? shortDateTime(s.openedAt, { locale, timeZone }) : "—",
    },
  ];

  return (
    <div
      className="flex flex-col gap-section [font-family:var(--font-ui)]"
      data-testid="platform-settings"
    >
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="max-w-[48rem]">{t("intro")}</p>
      </header>

      {initial === null ? (
        <Alert tone="error" title={t("loadFailedTitle")}>
          <p>{t("loadFailed")}</p>
          <Button
            variant="outline"
            size="small"
            onClick={() => router.refresh()}
          >
            {t("retry")}
          </Button>
        </Alert>
      ) : (
        <>
          <div className="grid items-start gap-section lg:grid-cols-2">
            <section
              className="flex min-w-0 flex-col gap-4"
              aria-labelledby="policies-title"
            >
              <h2 id="policies-title" className="mds-h2">
                {t("policiesHeading")}
              </h2>
              <ul className="m-0 flex list-none flex-col rounded-surface border border-neutral-subtle p-0">
                {items.map((p) => (
                  <li
                    key={p.key}
                    className="flex flex-col gap-2 border-b border-neutral-subtle p-4 last:border-b-0"
                    data-testid={`policy-${p.key}`}
                  >
                    <Switch
                      label={t(`policies.${p.key}.title` as never)}
                      description={t(`policies.${p.key}.body` as never)}
                      checked={p.enabled}
                      disabled={busy === p.key}
                      onCheckedChange={(next) => void toggle(p.key, next)}
                    />
                    {p.ownScopes.length > 0 ? (
                      <p className="mds-caption">
                        {t("ownScopes", { names: p.ownScopes.join(", ") })}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
              <p className="mds-caption">{t("instantNote")}</p>
            </section>

            <section
              className="flex min-w-0 flex-col gap-4"
              aria-labelledby="combine-title"
            >
              <h2 id="combine-title" className="mds-h2">
                {t("combineHeading")}
              </h2>
              <div className="flex flex-col gap-4 rounded-surface border border-neutral-subtle p-4">
                <p>{t("combineIntro")}</p>
                <ol className="m-0 flex list-none flex-col p-0">
                  {STEPS.map((step, index) => (
                    <li
                      key={step}
                      className="flex gap-3 border-b border-neutral-subtle py-3 first:pt-0 last:border-b-0"
                    >
                      <span
                        className="w-4 shrink-0 font-semibold"
                        aria-hidden="true"
                      >
                        {index + 1}
                      </span>
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="font-medium">
                          {t(`steps.${step}.title`)}
                        </span>
                        <span className="mds-caption">
                          {t(`steps.${step}.body`)}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
                <Alert tone="warning" title={t("combineWarningTitle")}>
                  {t("combineWarning")}
                </Alert>
              </div>
            </section>
          </div>

          <section
            className="flex flex-col gap-4"
            aria-labelledby="scoped-title"
          >
            <h2 id="scoped-title" className="mds-h2">
              {t("scopedHeading")}
            </h2>
            <Table
              caption={t("scopedHeading")}
              columns={columns}
              rows={initial.scoped.items}
              rowKey={(s) => `${s.scope.id}:${s.key}`}
              responsive="stack"
              empty={<EmptyState>{t("scopedEmpty")}</EmptyState>}
            />
          </section>
        </>
      )}
    </div>
  );
}
