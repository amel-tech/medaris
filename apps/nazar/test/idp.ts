import { vi } from "vitest";

/**
 * A stand-in for Keycloak at vitest.config.ts's issuer, behind a stubbed
 * global `fetch`, so the specs run the real openid-client through nazar's
 * `~/lib/auth` and nothing leaves the process. Its discovery document names
 * every endpoint (the web code writes none down, C4); `userinfo` answers what
 * the spec asks for. A request to anything else fails the spec.
 */
export const ISSUER = "http://127.0.0.1:1/realms/test";

export const endpoints = {
  authorization: `${ISSUER}/protocol/openid-connect/auth`,
  token: `${ISSUER}/protocol/openid-connect/token`,
  userinfo: `${ISSUER}/protocol/openid-connect/userinfo`,
  endSession: `${ISSUER}/protocol/openid-connect/logout`,
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

export function stubIdp(
  answers: { userinfo?: () => Response } = {}
): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === `${ISSUER}/.well-known/openid-configuration`) {
      return json(200, {
        issuer: ISSUER,
        authorization_endpoint: endpoints.authorization,
        token_endpoint: endpoints.token,
        userinfo_endpoint: endpoints.userinfo,
        end_session_endpoint: endpoints.endSession,
        jwks_uri: `${ISSUER}/protocol/openid-connect/certs`,
        response_types_supported: ["code"],
        subject_types_supported: ["public"],
        id_token_signing_alg_values_supported: ["RS256"],
      });
    }
    if (url === endpoints.userinfo && answers.userinfo) {
      return answers.userinfo();
    }
    throw new Error(`unexpected request to ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The URLs the stub was asked for, in order. */
export const requested = (fetchMock: ReturnType<typeof vi.fn>) =>
  fetchMock.mock.calls.map(([input]) =>
    input instanceof Request ? input.url : String(input)
  );

export { json };
