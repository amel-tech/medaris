export interface IJwtVerifier {
  /**
   * Verifies the JWT token.
   * @param token The JWT string to be verified.
   * @returns The decoded payload or an error.
   * @throws {JwtDecodeError} If token header cannot be decoded.
   * @throws {JwtMissingKidError} If the 'kid' is missing from header.
   * @throws {KeyNotFoundError} If no signing key matches the token's `kid` and `alg`.
   * @throws {JwtVerificationError} If token verification fails.
   * @throws {JwtClaimError} If the signature holds but a claim is refused.
   */
  verifyToken(token: string): Promise<any>;
}
