import type {
  AssignmentResponse,
  EffectivePermissionGroup,
} from "@medaris/services/tedrisat";
import { Icon } from "@medaris/ui/mds/icon";
import { Fragment } from "react";
import type { AccountMessages } from "../account-messages";
import {
  type ExpiryNote,
  expiryNote,
  PERMISSION_NOTE_CODES,
  permissionMessageKey,
  ROLE_DEFAULTS_NOTE,
  visibleGroups,
} from "../account-view";

const joinNames = (names: string[], locale: string) =>
  new Intl.ListFormat(locale, { style: "long", type: "conjunction" }).format(
    names
  );

/** The role's title and, when it holds in several scopes, the line that says so. */
function heading(
  group: EffectivePermissionGroup,
  t: AccountMessages,
  locale: string
) {
  const roleLabel = group.role ? t(`roles.${group.role}`) : t("grantedRole");
  const names = group.scopes
    .map((scope) => scope.name)
    .filter((name): name is string => Boolean(name));
  if (group.scopes.length === 1 && names.length === 1) {
    return {
      title: `${names[0]} · ${roleLabel.toLocaleLowerCase(locale)}`,
      scopeLine: null,
    };
  }
  if (names.length === 0) return { title: roleLabel, scopeLine: null };
  const key =
    group.role === "MUDERRIS" ? "eachScope.MUDERRIS" : "eachScope.default";
  return {
    title: roleLabel,
    scopeLine: t(key, { role: roleLabel, names: joinNames(names, locale) }),
  };
}

const noteText = (
  note: ExpiryNote,
  t: AccountMessages,
  day: Intl.DateTimeFormat
): string | null => {
  if (note.kind === "indefinite") return t(`indefinite.${note.role}`);
  if (note.kind === "ends") return t("endsNote", { date: day.format(note.at) });
  return null;
};

/**
 * "Etkin izinleriniz" (nizam 36, 47): each role's permission sentences, from
 * the caller's real permissions only, and under each the line about when they
 * end. A code the page has no sentence for is left out rather than shown as
 * a bare code.
 */
export function PermissionsList({
  groups,
  assignments,
  chief,
  locale,
  day,
  t,
}: {
  groups: EffectivePermissionGroup[];
  assignments: Pick<AssignmentResponse, "role" | "expiresAt">[];
  /** the realm's SYSTEM_ADMIN: all permissions, in every scope, as one sentence */
  chief: boolean;
  locale: string;
  day: Intl.DateTimeFormat;
  t: AccountMessages;
}) {
  const shown = visibleGroups(groups, (key) => t.has(key));
  return (
    <>
      {chief ? (
        <section
          className="flex flex-col gap-3"
          aria-labelledby="perm-chief"
          data-testid="permission-group"
        >
          <h4 className="mds-h6" id="perm-chief">
            {`${t("chiefScope")} · ${t("roles.chief").toLocaleLowerCase(locale)}`}
          </h4>
          <p>{t("chiefPermissions")}</p>
        </section>
      ) : null}
      {shown.map((group, index) => {
        const { title, scopeLine } = heading(group, t, locale);
        const note = noteText(
          expiryNote(group.role ?? null, assignments),
          t,
          day
        );
        return (
          <Fragment
            key={`${group.role ?? "grant"}-${group.scopeType}-${index}`}
          >
            {index === 0 && !chief ? null : <hr className="mds-separator" />}
            <section
              className="flex flex-col gap-3"
              aria-labelledby={`perm-group-${index}`}
              data-testid="permission-group"
            >
              <h4 className="mds-h6" id={`perm-group-${index}`}>
                {title}
              </h4>
              {scopeLine ? <p className="mds-body-sm">{scopeLine}</p> : null}
              <ul>
                {group.permissions.map((code) => (
                  <li
                    key={code}
                    className="flex items-start gap-3 border-be border-neutral-subtle py-2"
                    data-permission={code}
                  >
                    <Icon name="check" size="sm" className="mt-1 shrink-0" />
                    <span className="flex flex-col">
                      <span>
                        {t(`permissions.${permissionMessageKey(code)}`)}
                      </span>
                      {PERMISSION_NOTE_CODES.has(code) &&
                      t.has(`permissionNotes.${permissionMessageKey(code)}`) ? (
                        <span className="mds-caption">
                          {t(`permissionNotes.${permissionMessageKey(code)}`)}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {group.role && ROLE_DEFAULTS_NOTE.has(group.role) ? (
                <p className="mds-caption">{t(`defaultsNote.${group.role}`)}</p>
              ) : null}
              {note ? (
                <p className="mds-caption" data-testid="expiry-note">
                  {note}
                </p>
              ) : null}
            </section>
          </Fragment>
        );
      })}
    </>
  );
}
