/**
 * The Medaris app a Keycloak client belongs to, for the name under the logo:
 * `nizam-dev` and `nizam` are Nizam. Any other client (a partner's, the
 * account console) gets no name.
 */
export function appOfClient(
  clientId: string | undefined
): "tedris" | "nizam" | "nazar" | undefined {
  const match = /^(tedris|nizam|nazar)(?:-|$)/.exec(clientId ?? "");
  return match?.[1] as "tedris" | "nizam" | "nazar" | undefined;
}
