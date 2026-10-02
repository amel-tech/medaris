import type { EffectivePermissionGroup } from "@medaris/services/tedrisat";
import { Icon } from "@medaris/ui/mds/icon";
import type { AccountMessages } from "../account-messages";
import {
  PERMISSION_NOTE_CODES,
  permissionMessageKey,
  ROLE_DEFAULTS_NOTE,
} from "../permission-notes";

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
    return { title: `${names[0]} · ${roleLabel}`, scopeLine: null };
  }
  if (names.length === 0) return { title: roleLabel, scopeLine: null };
  const key =
    group.role === "MUDERRIS" ? "eachScope.MUDERRIS" : "eachScope.default";
  return {
    title: roleLabel,
    scopeLine: t(key, {
      role: roleLabel,
      names: joinNames(names, locale),
    }),
  };
}

/**
 * "Etkin izinlerin" (tedris 43): each role's permission sentences, from the
 * caller's real permissions only. A code the page has no sentence for is left
 * out rather than shown as a bare code.
 */
export function PermissionsList({
  groups,
  locale,
  t,
}: {
  groups: EffectivePermissionGroup[];
  locale: string;
  t: AccountMessages;
}) {
  return (
    <>
      {groups.map((group, index) => {
        const { title, scopeLine } = heading(group, t, locale);
        const codes = group.permissions.filter((code) =>
          t.has(`permissions.${permissionMessageKey(code)}`)
        );
        if (codes.length === 0) return null;
        return (
          <section
            key={`${group.role ?? "grant"}-${group.scopeType}-${index}`}
            className="flex flex-col gap-3"
            aria-labelledby={`perm-group-${index}`}
            data-testid="permission-group"
          >
            <h3 className="mds-h3" id={`perm-group-${index}`}>
              {title}
            </h3>
            {scopeLine ? <p className="mds-caption">{scopeLine}</p> : null}
            <ul className="md:columns-2 md:gap-x-8">
              {codes.map((code) => (
                <li
                  key={code}
                  className="flex break-inside-avoid items-start gap-2 border-be py-2"
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
          </section>
        );
      })}
    </>
  );
}
