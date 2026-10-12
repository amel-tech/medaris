import type {
  CompactJWSHeaderParameters,
  CryptoKey,
  FlattenedJWSInput,
  JWK,
  KeyObject,
} from "jose";

/**
 * Where `JwtVerifierService` gets the key a token was signed with.
 *
 * The method has the shape of jose's `JWTVerifyGetKey` (auth audit C5), so a
 * JSON Web Key Set from `createRemoteJWKSet` or `createLocalJWKSet` is a
 * provider as it stands, and the key is chosen by the token's own protected
 * header: its `kid`, and its `alg`, which also decides the key type (RSA for
 * RS256, EC P-256 for ES256, OKP Ed25519 for EdDSA). Before C5 this returned
 * a PEM built from the JWK's `x5c` certificate, which only RSA keys published
 * with a certificate could satisfy.
 *
 * The seam itself is MDRS-89's: the tedrisat suite replaces the provider with
 * an in-process one so that no test reaches the network.
 */
export interface IPublicKeyProvider {
  /**
   * Resolves the public key that verifies the token.
   * @param protectedHeader The token's protected header (`kid`, `alg`).
   * @param token The token's parts, as jose passes them; nothing in it has
   *   been authenticated yet.
   * @throws {KeyNotFoundError} Or jose's `JWKSNoMatchingKey`, when no key
   *   matches; the verifier reports both as `KeyNotFoundError`.
   */
  getKey(
    protectedHeader: CompactJWSHeaderParameters,
    token: FlattenedJWSInput
  ): Promise<CryptoKey | KeyObject | JWK>;
}
