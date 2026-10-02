import type { ScopeOption } from "./components/scope-picker";
import { type Scope, scopeHref, scopeKey } from "./scope";

/**
 * A scope as the picker draws it. The words come in from the caller (a
 * translator on the server, a stub in a spec): the role's label and the
 * course imam's.
 */
export function scopeOption(
  scope: Scope,
  words: { role: (role: string) => string; imam: string }
): ScopeOption {
  const summary = [words.role(scope.role)];
  if (scope.isImam) summary.push(words.imam);
  return {
    key: scopeKey(scope),
    kind: scope.kind,
    id: scope.id,
    href: scopeHref(scope),
    name: scope.name,
    summary,
    detail: scope.koskName ? [...summary, scope.koskName] : summary,
  };
}
