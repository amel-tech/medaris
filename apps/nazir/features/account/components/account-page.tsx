import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Field } from "@medaris/ui/mds/field";
import { Input } from "@medaris/ui/mds/input";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import { getLocale } from "next-intl/server";
import { type ReactNode, Suspense } from "react";
import type { Portal } from "~/features/shell/reads";
import { getMessages } from "~/lib/i18n/messages";
import { assignmentRows, lacksNazirRoles } from "../assignments-view";
import { visibleGroups } from "../permissions";
import { getEffectivePermissions, getViewer } from "../reads";
import { AssignmentsTable } from "./assignments-table";
import { PermissionsList } from "./permissions-list";
import { SignOutButton } from "./sign-out-button";
import { TimeZoneForm } from "./time-zone-form";

type OkPortal = Extract<Portal, { status: "ok" }>;

function Card({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mds-card flex flex-col gap-stack p-card"
    >
      <h2 className="mds-h3" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

async function PermissionsCard({
  assignments,
  timeZone,
}: {
  assignments: OkPortal["assignments"];
  timeZone: string;
}) {
  const [t, locale, groups] = await Promise.all([
    getMessages(),
    getLocale(),
    getEffectivePermissions(),
  ]);
  const shown = groups ? visibleGroups(groups, t) : [];

  return (
    <Card id="permissions-heading" title={t("Account.permissionsTitle")}>
      <p className="mds-body-sm">{t("Account.permissionsIntro")}</p>
      {groups === null ? (
        <Alert tone="error" title={t("Account.loadFailedTitle")}>
          <p>{t("Account.loadFailed")}</p>
        </Alert>
      ) : shown.length === 0 ? (
        <EmptyState>{t("Account.permissionsEmpty")}</EmptyState>
      ) : (
        <PermissionsList
          shown={shown}
          assignments={assignments}
          locale={locale}
          timeZone={timeZone}
          t={t}
        />
      )}
    </Card>
  );
}

function PermissionsSkeleton() {
  return (
    <output className="mds-card flex flex-col gap-4 p-card" aria-busy="true">
      <Skeleton width="40%" height="1.75rem" />
      <Skeleton width="80%" />
      <Skeleton height="8rem" />
    </output>
  );
}

/**
 * Hesap ve ayarlar (nazir 20). Two columns on a wide screen: the roles, the
 * permissions and the time zone on the left; the account and the way out on
 * the right. The roles come from the portal read the layout already made, so
 * they are on screen at once; the permissions are read behind a skeleton, and
 * a failed read of either leaves its own card to say so.
 */
export async function AccountPage({ portal }: { portal: OkPortal }) {
  const [t, locale, me] = await Promise.all([
    getMessages(),
    getLocale(),
    getViewer(),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone });
  const rows = assignmentRows(portal.assignments, t, day);
  const { person } = portal;
  const roleLine = (portal.roles.length > 0 ? portal.roles : ["STUDENT"])
    .map((role) => t(`Roles.${role}`))
    .join(" · ");

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="mds-h1">{t("Account.pageTitle")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {t("Account.pageSubtitle")}
        </p>
      </header>
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <div className="flex min-inline-0 flex-col gap-grid">
          <Card id="tasks-heading" title={t("Account.tasksTitle")}>
            <p className="mds-body-sm">{t("Account.tasksIntro")}</p>
            <AssignmentsTable
              rows={rows}
              labels={{
                caption: t("Account.tasksTitle"),
                imam: t("Account.imam"),
                role: t("Account.columns.role"),
                scope: t("Account.columns.scope"),
                grantor: t("Account.columns.grantor"),
                expires: t("Account.columns.expires"),
              }}
            />
            {lacksNazirRoles(portal.assignments) ? (
              <p className="mds-caption">{t("Account.noNazirNote")}</p>
            ) : null}
          </Card>
          <Suspense fallback={<PermissionsSkeleton />}>
            <PermissionsCard
              assignments={portal.assignments}
              timeZone={timeZone}
            />
          </Suspense>
          <Card id="time-heading" title={t("Account.timeTitle")}>
            {me ? (
              <TimeZoneForm
                current={timeZone}
                labels={{
                  zone: t("Account.timeZone"),
                  help: t("Account.timeZoneHelp"),
                  other: t("Account.timeZoneOther"),
                  otherZones: t("Account.timeZoneOtherLabel"),
                  saved: t("Account.timeZoneSaved"),
                  failedTitle: t("Account.timeZoneFailedTitle"),
                  failed: t("Account.timeZoneFailed"),
                }}
              />
            ) : (
              <Alert tone="error">
                <p>{t("Account.timeZoneUnreadable")}</p>
              </Alert>
            )}
            <Field
              label={t("Account.language")}
              help={t("Account.languageHelp")}
            >
              <Input readOnly value={t("Account.languageValue")} />
            </Field>
          </Card>
        </div>
        <div className="flex flex-col gap-grid">
          <Card id="account-heading" title={t("Account.accountTitle")}>
            <div className="flex items-center gap-3">
              <Avatar name={person.name} decorative />
              <span className="flex min-inline-0 flex-col">
                <span className="font-medium">
                  <bdi>{person.name}</bdi>
                </span>
                <span className="mds-caption">{roleLine}</span>
              </span>
            </div>
            {person.email ? (
              <Field label={t("Account.email")} help={t("Account.emailHelp")}>
                <Input readOnly mono value={person.email} />
              </Field>
            ) : null}
          </Card>
          <section className="mds-card flex flex-col items-start gap-3 p-card">
            <p className="mds-body-sm">{t("Account.signOutNote")}</p>
            <SignOutButton
              label={t("Account.signOut")}
              busy={t("Account.signOutBusy")}
            />
          </section>
        </div>
      </div>
    </>
  );
}
