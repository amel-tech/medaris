/**
 * Clients whose tokens the routes behind `AuthGuard` refuse, read per token
 * rather than once at boot: a registry that changes while the API runs.
 *
 * Partner enrollments need it. A partner application's service account mints
 * tokens with this API's own audience, so with an empty `azp` allow-list every
 * route behind `AuthGuard` would take them; they belong on the partner routes
 * alone. The partners are rows the başnazım adds in nizam, so the API learns of
 * one without a restart, and a static `keycloak.refusedClients` could not name
 * it.
 *
 * Optional: a service that provides none (`REFUSED_CLIENT_SOURCE`) refuses by
 * its configuration alone. An implementation answers from memory where it can,
 * because it runs on every authenticated request, and throws rather than say
 * "not refused" when it cannot tell: the verifier then refuses the token.
 */
export interface IRefusedClientSource {
  /** Whether a token whose `azp` is `clientId` is refused here. */
  isRefused(clientId: string): Promise<boolean>;
}
