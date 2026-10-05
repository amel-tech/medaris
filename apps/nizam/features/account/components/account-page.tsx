import { Avatar } from "@medaris/ui/mds/avatar";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Icon } from "@medaris/ui/mds/icon";
import { Input } from "@medaris/ui/mds/input";
import { getLocale, getTimeZone } from "next-intl/server";
import { env } from "~/env";
import { getAccountMessages } from "../account-messages";
import {
  courseBadge,
  effectiveZone,
  FEATURED_TIME_ZONES,
  heldRoleKeys,
  roleSummary,
  scopeMeta,
  visibleGroups,
} from "../account-view";
import type { AccountData } from "../reads";
import { type AssignmentRow, AssignmentsTable } from "./assignments-table";
import { PermissionsList } from "./permissions-list";
import { TimeZoneForm } from "./time-zone-form";

const BADGE_VARIANT = {
  published: "primary",
  draft: "outline",
  hidden: "ghost",
} as const;

/**
 * Hesap ve ayarlar (design nizam/36 for the köşk nazımı, nizam/47 for Medaris
 * administration, MDRS-179): the person's roles with their scope, grantor and
 * term, the permissions those roles give, the time zone, and the account card
 * with the e-mail and "Çıkış yap". Every sentence is worded here, on the
 * server, in the viewer's language and zone.
 */
export async function AccountPage({
  data,
  sessionName,
}: {
  data: AccountData;
  /** the name from the sign-in, when the profile has none */
  sessionName: string;
}) {
  const t = await getAccountMessages();
  const locale = await getLocale();
  const zone = effectiveZone(data.me.timeZone);
  const viewerZone = (await getTimeZone()) ?? zone;
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone: viewerZone,
  });

  // The köşk sentence only fits someone who holds a köşk nazımlığı; the
  // Medaris nazımı has none, and without any group there is nothing to list.
  const introKey = data.systemAdmin
    ? "permissionsIntroChief"
    : data.assignments.some((a) => a.role === "KOSK_NAZIM")
      ? "permissionsIntro"
      : "permissionsIntroMedaris";
  const noPermissions =
    !data.systemAdmin &&
    visibleGroups(data.groups, (key) => t.has(key)).length === 0;

  const rows: AssignmentRow[] = [
    ...(data.systemAdmin
      ? [
          {
            id: "chief",
            role: t("roles.chief"),
            isImam: false,
            scopeTitle: t("chiefScope"),
            scopeBadge: null,
            scopeMeta: [],
            grantor: t("chiefGrantor"),
            grantedAt: null,
            expires: { label: t("noExpiry"), iso: null },
          } satisfies AssignmentRow,
        ]
      : []),
    ...data.assignments.map((a): AssignmentRow => {
      const badge = courseBadge(a.course);
      return {
        id: a.id,
        role: t(`roles.${a.role}`),
        isImam: a.isImam,
        scopeTitle: a.scopeName ?? t("chiefScope"),
        scopeBadge: badge
          ? {
              label: t(`courseBadge.${badge}`),
              variant: BADGE_VARIANT[badge],
              hidden: badge === "hidden",
            }
          : null,
        scopeMeta: scopeMeta(a),
        grantor: a.grantedBySelf
          ? t("self")
          : (a.grantedBy.displayName ?? t("unknownPerson")),
        grantedAt: {
          label: day.format(new Date(a.grantedAt)),
          iso: new Date(a.grantedAt).toISOString(),
        },
        expires: a.expiresAt
          ? {
              label: t("until", { date: day.format(new Date(a.expiresAt)) }),
              iso: new Date(a.expiresAt).toISOString(),
            }
          : { label: t("noExpiry"), iso: null },
      };
    }),
  ];

  const roleKeys = heldRoleKeys(data.systemAdmin, data.assignments);
  const name =
    [data.me.givenName, data.me.familyName].filter(Boolean).join(" ").trim() ||
    sessionName;
  const teaches = data.assignments.some((a) => a.role === "MUDERRIS");
  const nazarUrl = env.NAZAR_URL ? env.NAZAR_URL.replace(/\/+$/, "") : null;

  const names: Record<string, string> = {};
  for (const id of FEATURED_TIME_ZONES) names[id] = t(`zones.${id}`);

  return (
    <div className="mx-auto flex w-full max-w-[80rem] flex-col gap-section">
      <header className="flex flex-col gap-2">
        <h1 className="mds-h1">{t("pageTitle")}</h1>
        <p className="mds-body-sm">{t("pageSubtitle")}</p>
      </header>
      <div className="grid items-start gap-section grid-cols-[minmax(0,1fr)_var(--layout-aside,22rem)] max-md:grid-cols-1">
        <div className="flex flex-col gap-section">
          <section
            aria-labelledby="tasks-heading"
            className="mds-card flex flex-col gap-4 p-card"
          >
            <div className="flex flex-col gap-2">
              <h2 className="mds-h2" id="tasks-heading">
                {t("tasksTitle")}
              </h2>
              <p className="mds-body-sm">{t("tasksIntro")}</p>
            </div>
            {rows.length > 0 ? (
              <AssignmentsTable
                rows={rows}
                labels={{
                  caption: t("tasksTitle"),
                  imam: t("imam"),
                  role: t("columns.role"),
                  scope: t("columns.scope"),
                  grantor: t("columns.grantor"),
                  expires: t("columns.expires"),
                }}
              />
            ) : (
              <p className="mds-body-sm">{t("noTasks")}</p>
            )}
          </section>

          {rows.length > 0 ? (
            <section
              aria-labelledby="permissions-heading"
              className="mds-card flex flex-col gap-6 p-card"
            >
              <div className="flex flex-col gap-2">
                <h2 className="mds-h2" id="permissions-heading">
                  {t("permissionsTitle")}
                </h2>
                <p className="mds-body-sm">{t(introKey)}</p>
              </div>
              {noPermissions ? (
                <p className="mds-body-sm" data-testid="permissions-empty">
                  {t("permissionsEmpty")}
                </p>
              ) : null}
              <PermissionsList
                groups={data.groups}
                assignments={data.assignments}
                chief={data.systemAdmin}
                locale={locale}
                day={day}
                t={t}
              />
            </section>
          ) : null}

          <section
            aria-labelledby="zone-heading"
            className="mds-card flex flex-col gap-4 p-card"
          >
            <h2 className="mds-h2" id="zone-heading">
              {t("zoneTitle")}
            </h2>
            <TimeZoneForm
              saved={zone}
              labels={{
                zone: t("zone"),
                zoneHelp: t("zoneHelp"),
                other: t("zoneOther"),
                allZones: t("allZones"),
                allZonesHelp: t("allZonesHelp"),
                savedTitle: t("zoneSavedTitle"),
                savedText: t("zoneSavedText"),
                failedTitle: t("zoneFailedTitle"),
                failedText: t("zoneFailedText"),
                names,
              }}
            />
            <Field label={t("language")} help={t("languageHelp")}>
              <Input value={t("languageValue")} readOnly />
            </Field>
          </section>
        </div>

        <aside
          className="flex flex-col gap-section"
          aria-label={t("accountTitle")}
        >
          <section className="mds-card flex flex-col gap-4 p-card">
            <h2 className="mds-h3">{t("accountTitle")}</h2>
            <div className="flex items-center gap-3">
              <Avatar name={name} size="lg" decorative />
              <div className="flex min-inline-0 flex-col">
                <strong data-testid="account-name">
                  <bdi>{name}</bdi>
                </strong>
                {roleKeys.length > 0 ? (
                  <span className="mds-caption">
                    {roleSummary(roleKeys, (r) => t(`roles.${r}`), locale)}
                  </span>
                ) : null}
              </div>
            </div>
            <Field label={t("email")} help={t("emailHelp")}>
              <Input
                value={data.me.email ?? ""}
                readOnly
                mono
                data-testid="account-email"
              />
            </Field>
          </section>

          {teaches ? (
            <section className="mds-card flex flex-col gap-3 p-card">
              <h2 className="mds-h3">{t("teachingTitle")}</h2>
              <p className="mds-body-sm">{t("teachingText")}</p>
              {nazarUrl ? (
                <div>
                  <Button
                    href={nazarUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                    iconLeft={<Icon name="externalLink" />}
                  >
                    {t("openNazar")}
                  </Button>
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="mds-card flex flex-col gap-3 p-card">
            <p className="mds-body-sm">{t("signOutText")}</p>
            <div>
              <Button
                href={`/${locale}/auth/signout`}
                variant="secondary"
                iconLeft={<Icon name="signOut" />}
              >
                {t("signOut")}
              </Button>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
