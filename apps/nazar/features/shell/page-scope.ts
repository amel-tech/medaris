import { cache } from "react";
import { openedScope } from "./opened-scope";
import { getPortal } from "./reads";
import { findScope, type Scope, type ScopeKind } from "./scope";

/**
 * The scope a page under `/medrese/<id>` or `/ders/<id>` is drawn in, found as
 * its layout finds it: one of the caller's own, else one opened by its address
 * (`openedScope`); undefined when there is neither, which the layout has
 * already answered with a 404, the no-access page or the retry state.
 */
export const pageScope = cache(
  async (kind: ScopeKind, id: string): Promise<Scope | undefined> => {
    const portal = await getPortal();
    if (portal.status !== "ok") return undefined;
    const own = findScope(portal.scopes, kind, id);
    if (own) return own;
    const opened = await openedScope(kind, id);
    return opened.status === "ok" ? opened.scope : undefined;
  }
);
