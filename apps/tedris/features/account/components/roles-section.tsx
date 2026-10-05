import { SystemState } from "@medaris/ui/mds/system-state";
import { getLocale, getTimeZone } from "next-intl/server";
import { env } from "~/env";
import { getAccountMessages } from "../account-messages";
import { courseBadge, openUrl, roleApp, scopeMeta } from "../assignment-view";
import { getAccountRoles } from "../reads";
import { type AssignmentRow, AssignmentsTable } from "./assignments-table";
import { PermissionsList } from "./permissions-list";

const BADGE_VARIANT = {
  published: "primary",
  draft: "outline",
  hidden: "ghost",
} as const;

/**
 * "Görevlerin ve izinlerin" (MDRS-169, design tedris/43). Shown only to a
 * person who holds a role: for everyone else the section is not there at all,
 * and the page is the plain account page. A failed read leaves the section's
 * own message in its place and nothing else on the page changes.
 */
export async function RolesSection() {
  const roles = await getAccountRoles();
  const t = await getAccountMessages();

  if (!roles) {
    return (
      <section aria-labelledby="roles-heading" className="mds-card p-card">
        <SystemState shell headingLevel={2} title={t("loadFailedTitle")}>
          {t("loadFailed")}
        </SystemState>
      </section>
    );
  }
  if (roles.assignments.length === 0) return null;

  const locale = await getLocale();
  const timeZone = (await getTimeZone()) ?? "Europe/Istanbul";
  const day = new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeZone,
  });
  const urls = { nizam: env.NIZAM_URL, nazir: env.NAZAR_URL };

  const rows: AssignmentRow[] = roles.assignments.map((a) => {
    const roleLabel = t(`roles.${a.role}`);
    const app = roleApp(a.role);
    const href = openUrl(a, urls);
    const badge = courseBadge(a.course);
    return {
      id: a.id,
      role: roleLabel,
      isImam: a.isImam,
      scopeTitle: a.scopeName,
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
            label: day.format(new Date(a.expiresAt)),
            iso: new Date(a.expiresAt).toISOString(),
          }
        : { label: t("noExpiry"), iso: null },
      action: href
        ? {
            label: t(`open.${app}`),
            ariaLabel: `${t(`open.${app}`)}: ${roleLabel.toLocaleLowerCase(locale)}${a.scopeName ? `, ${a.scopeName}` : ""}`,
            href,
          }
        : null,
    };
  });

  return (
    <section
      aria-labelledby="roles-heading"
      className="mds-card flex flex-col gap-section p-card"
    >
      <div className="flex flex-col gap-2">
        <h2 className="mds-h2" id="roles-heading">
          {t("title")}
        </h2>
        <p>{t("intro")}</p>
        <p>{t("whereIntro")}</p>
      </div>
      <div className="flex flex-col gap-3">
        <AssignmentsTable
          rows={rows}
          labels={{
            caption: t("tasks"),
            imam: t("imam"),
            role: t("columns.role"),
            scope: t("columns.scope"),
            grantor: t("columns.grantor"),
            expires: t("columns.expires"),
            actions: t("columns.actions"),
          }}
        />
      </div>
      {roles.groups.length > 0 ? (
        <>
          <hr className="mds-separator" />
          <section
            aria-labelledby="permissions-heading"
            className="flex flex-col gap-6"
          >
            <div className="flex flex-col gap-2">
              <h3 className="mds-h5" id="permissions-heading">
                {t("permissionsTitle")}
              </h3>
              <p>{t("permissionsIntro")}</p>
            </div>
            <PermissionsList groups={roles.groups} locale={locale} t={t} />
          </section>
        </>
      ) : null}
    </section>
  );
}
