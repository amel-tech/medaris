/**
 * Stands in for `openid-client` in every spec (`vi.mock("openid-client", …)`
 * returns this module), so nothing reaches an IdP. The functions are spies
 * with the defaults `resetOpenidClient()` restores; a spec overrides the ones
 * it is about.
 */
import { vi } from "vitest";

export const IDP = "https://idp.example/realms/medaris";

export const skipSubjectCheck = Symbol("skipSubjectCheck");
export const allowInsecureRequests = vi.fn();

export const configuration = {
  serverMetadata: vi.fn(() => ({
    issuer: IDP,
    end_session_endpoint: `${IDP}/end-session`,
  })),
};

export const discovery = vi.fn();
export const randomState = vi.fn();
export const randomNonce = vi.fn();
export const randomPKCECodeVerifier = vi.fn();
export const calculatePKCECodeChallenge = vi.fn();
export const buildAuthorizationUrl = vi.fn();
export const authorizationCodeGrant = vi.fn();
export const refreshTokenGrant = vi.fn();
export const fetchUserInfo = vi.fn();
export const buildEndSessionUrl = vi.fn();

const withParameters = (path: string, parameters: Record<string, string>) => {
  const url = new URL(`${IDP}${path}`);
  for (const [key, value] of Object.entries(parameters)) {
    url.searchParams.set(key, value);
  }
  return url;
};

let states = 0;

export function resetOpenidClient(): void {
  states = 0;
  for (const spy of [
    discovery,
    randomState,
    randomNonce,
    randomPKCECodeVerifier,
    calculatePKCECodeChallenge,
    buildAuthorizationUrl,
    authorizationCodeGrant,
    refreshTokenGrant,
    fetchUserInfo,
    buildEndSessionUrl,
    configuration.serverMetadata,
  ]) {
    spy.mockReset();
  }
  configuration.serverMetadata.mockImplementation(() => ({
    issuer: IDP,
    end_session_endpoint: `${IDP}/end-session`,
  }));
  discovery.mockResolvedValue(configuration);
  randomState.mockImplementation(
    () => `state${String(++states).padStart(4, "0")}abcdefghijklmnopqrstuvwxyz`
  );
  randomNonce.mockReturnValue("nonce-value");
  randomPKCECodeVerifier.mockReturnValue("verifier-value");
  calculatePKCECodeChallenge.mockImplementation(
    async (verifier: string) => `S256(${verifier})`
  );
  buildAuthorizationUrl.mockImplementation(
    (_config: unknown, parameters: Record<string, string>) =>
      withParameters("/authorize", parameters)
  );
  buildEndSessionUrl.mockImplementation(
    (_config: unknown, parameters: Record<string, string>) =>
      withParameters("/end-session", parameters)
  );
}

resetOpenidClient();
