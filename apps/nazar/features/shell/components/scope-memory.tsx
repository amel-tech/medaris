"use client";

import { useEffect } from "react";
import { type ScopeKind, serializeScopeCookie } from "../scope";

/**
 * Leaves the `nazar-scope` cookie behind on a scoped page, so that `/` opens
 * the same scope next time. It draws nothing. A cookie written from the page
 * rather than by the server because a layout cannot set one while rendering.
 */
export function ScopeMemory({ kind, id }: { kind: ScopeKind; id: string }) {
  useEffect(() => {
    // biome-ignore lint/suspicious/noDocumentCookie: the Cookie Store API is not in every browser the portal supports, and the value is a plain string we built
    document.cookie = serializeScopeCookie({ kind, id });
  }, [kind, id]);
  return null;
}
