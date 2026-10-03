"use client";

import { Avatar } from "@medaris/ui/mds/avatar";
import { Icon } from "@medaris/ui/mds/icon";
import { joinRun } from "@medaris/ui/mds/locale";
import type { Person } from "../scope";

/**
 * The signed-in person at the foot of the sidebar and of the phone sheet
 * (`a.mds-nav-user`): name, the roles held, and the way to the account page.
 * Where there is no account page to go to (nazir 02) it is the same row as
 * plain text: no link, no chevron, no hover. A client component only because
 * the kit's `joinRun` lives in a module that also holds a hook.
 */
export function UserRow({
  person,
  roles,
  href,
  hint,
}: {
  person: Person;
  roles: string[];
  /** the account page; absent for a person who has no portal yet */
  href?: string;
  /** read after the roles, "ayarlar", where the row is a link */
  hint: string;
}) {
  const body = (
    <>
      <Avatar name={person.name} size="sm" decorative />
      <span className="mds-nav-user__text">
        <span className="mds-nav-user__name">
          <bdi>{person.name}</bdi>
        </span>
        <span className="mds-nav-user__role">
          {joinRun(roles)}
          {href ? <span className="mds-visually-hidden">, {hint}</span> : null}
        </span>
      </span>
      {href ? <Icon name="chevronRight" size="sm" /> : null}
    </>
  );
  return href ? (
    <a className="mds-nav-user" href={href}>
      {body}
    </a>
  ) : (
    <div className="mds-nav-user hover:bg-transparent">{body}</div>
  );
}
