export const PUBLIC_KEY_PROVIDER = "IPublicKeyProviderToken";
export const JWT_VERIFIER = "IJwtVerifierToken";
/**
 * An optional `IRefusedClientSource`. Provided from a global module, so the
 * `JwtVerifierService` of every `AuthGuardModule` import sees it.
 */
export const REFUSED_CLIENT_SOURCE = "IRefusedClientSourceToken";
