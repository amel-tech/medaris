import type { ScopeOption } from "./components/scope-picker";
import { type Scope, scopeHref, scopeKey } from "./scope";

/**
 * A scope as the picker draws it. The role's label comes in from the caller (a
 * translator on the server, a stub in a spec); the course imam is the star
 * after it, not a word (2026-10-13).
 */
export function scopeOption(
  scope: Scope,
  words: { role: (role: string) => string }
): ScopeOption {
  const summary = [words.role(scope.role)];
  return {
    key: scopeKey(scope),
    kind: scope.kind,
    id: scope.id,
    href: scopeHref(scope),
    name: scope.name,
    imam: scope.isImam,
    summary,
    detail: scope.koskName ? [...summary, scope.koskName] : summary,
  };
}
