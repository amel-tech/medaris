import type {
  AssignmentResponse,
  EffectivePermissionGroup,
} from "@medaris/services/tedrisat";
import { Icon } from "@medaris/ui/mds/icon";
import { Fragment } from "react";
import type { Messages } from "~/lib/i18n/messages";
import {
  groupExpiry,
  groupHeading,
  PERMISSION_NOTE_CODES,
  permissionMessageKey,
  ROLE_DEFAULTS_NOTE,
} from "../permissions";

/**
 * "Etkin izinleriniz" (nazir 20): each role's permission sentences from the
 * caller's real permissions, and when the role ends. `shown` is
 * `visibleGroups(...)`: a group none of whose codes has a sentence is not in
 * it, and the caller words the empty case.
 */
export function PermissionsList({
  shown,
  assignments,
  locale,
  timeZone,
  t,
}: {
  shown: Array<{ group: EffectivePermissionGroup; codes: string[] }>;
  assignments: AssignmentResponse[];
  locale: string;
  timeZone: string;
  t: Messages;
}) {
  const day = new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone });

  return (
    <>
      {shown.map(({ group, codes }, index) => {
        const { title, scopeLine } = groupHeading(group, t, locale);
        const expiry = groupExpiry(group, assignments);
        return (
          <Fragment
            key={`${group.role ?? "grant"}-${group.scopeType}-${index}`}
          >
            {index === 0 ? null : <hr className="mds-separator" />}
            <section
              className="flex flex-col gap-3"
              aria-labelledby={`perm-group-${index}`}
              data-testid="permission-group"
            >
              <h3 className="mds-h6" id={`perm-group-${index}`}>
                {title}
              </h3>
              {scopeLine ? <p className="mds-caption">{scopeLine}</p> : null}
              <ul className="ps-0 md:columns-2 md:gap-x-8">
                {codes.map((code) => (
                  <li
                    key={code}
                    className="flex break-inside-avoid items-start gap-2 border-be border-neutral-subtle py-2"
                    data-permission={code}
                  >
                    <Icon name="check" size="sm" className="mbs-1 shrink-0" />
                    <span className="flex flex-col">
                      <span className="mds-body-sm">
                        {t(`Account.permissions.${permissionMessageKey(code)}`)}
                      </span>
                      {PERMISSION_NOTE_CODES.has(code) &&
                      t.has(
                        `Account.permissionNotes.${permissionMessageKey(code)}`
                      ) ? (
                        <span className="mds-caption">
                          {t(
                            `Account.permissionNotes.${permissionMessageKey(code)}`
                          )}
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
              {group.role && ROLE_DEFAULTS_NOTE.has(group.role) ? (
                <p className="mds-caption">
                  {t(`Account.defaultsNote.${group.role}`)}
                </p>
              ) : null}
              {expiry ? (
                <p className="mds-caption">
                  {expiry.kind === "none"
                    ? t("Account.expiryNone")
                    : t(
                        expiry.kind === "at"
                          ? "Account.expiryAt"
                          : "Account.expiryEarliest",
                        { date: day.format(expiry.at) }
                      )}
                </p>
              ) : null}
            </section>
          </Fragment>
        );
      })}
    </>
  );
}
