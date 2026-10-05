import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { getMessages } from "~/lib/i18n/messages";
import { getMenuCounts, getPortal } from "../reads";
import {
  defaultScope,
  findScope,
  NO_ACCESS_PATH,
  SCOPE_COOKIE,
  type ScopeKind,
} from "../scope";
import { LoadFailed } from "./load-failed";
import { PortalFrame } from "./portal-frame";

/** The roles could not be read (nazir 02, criterion 5): a retry state, not a verdict about access. */
export async function PortalUnavailable({
  shell = false,
}: {
  shell?: boolean;
}) {
  const t = await getMessages("nazar.Shell");
  return (
    <LoadFailed
      shell={shell}
      title={t("loadFailedTitle")}
      text={t("loadFailed")}
      retry={t("retry")}
    />
  );
}

/**
 * The layout body of every page with a menu. `scope` names the scope the page
 * belongs to (`/medrese/<id>`, `/ders/<id>`); `null` is a page outside any
 * scope (`/hesap`, `/bildirimler`), whose menu is the remembered scope's.
 *
 * A scope that is not one of the caller's answers 404, in the same words as a
 * route that is not there, so the portal never says which ids exist. A person
 * with no scope at all is sent to the no-access page instead.
 */
export async function PortalLayout({
  scope: wanted,
  children,
}: {
  scope: { kind: ScopeKind; id: string } | null;
  children: ReactNode;
}) {
  const portal = await getPortal();
  if (portal.status === "unavailable") return <PortalUnavailable />;

  const current = wanted
    ? findScope(portal.scopes, wanted.kind, wanted.id)
    : defaultScope(portal.scopes, (await cookies()).get(SCOPE_COOKIE)?.value);
  if (!current) {
    if (portal.scopes.length === 0) redirect(NO_ACCESS_PATH);
    notFound();
  }

  return (
    <PortalFrame
      person={portal.person}
      roles={portal.roles}
      scopes={portal.scopes}
      current={current}
      counts={await getMenuCounts(current)}
      remember={wanted !== null}
    >
      {children}
    </PortalFrame>
  );
}
