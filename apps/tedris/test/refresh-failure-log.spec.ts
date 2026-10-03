import {
  logRefreshFailure,
  summarizeRefreshFailure,
} from "@medaris/services/auth";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * MDRS-231: a failed Keycloak token refresh used to go to stdout whole, through
 * `console.log`. What reaches the log now is a summary an operator can act on —
 * never a token, a request body or a raw response. The helper is shared by the
 * three web apps through `@medaris/services/auth`; each app's wiring is checked
 * in its own `keycloak-session.spec.ts`.
 */

afterEach(() => {
  vi.restoreAllMocks();
});

describe("summarizeRefreshFailure", () => {
  it("keeps Keycloak's error fields and the status, drops tokens and bodies", () => {
    const failure = {
      status: 400,
      error: "invalid_grant",
      error_description: "Session not active",
      access_token: "secret-access",
      refresh_token: "secret-refresh",
      id_token: "secret-id",
      response: {
        status: 400,
        body: "refresh_token=secret-refresh&client_secret=secret-client",
        headers: { authorization: "Bearer secret-access" },
      },
      request: { body: "client_secret=secret-client" },
    };

    const summary = summarizeRefreshFailure(failure);

    expect(summary).toEqual({
      status: 400,
      error: "invalid_grant",
      error_description: "Session not active",
    });
    expect(JSON.stringify(summary)).not.toMatch(/secret/);
  });

  it("reads the status off a nested response when the failure has none of its own", () => {
    expect(
      summarizeRefreshFailure({
        response: { status: 502, body: "<html>secret</html>" },
      })
    ).toEqual({ status: 502 });
  });

  it("keeps an Error's name and message, and nothing hung off it", () => {
    const error = Object.assign(new TypeError("fetch failed"), {
      config: { body: "refresh_token=secret-refresh" },
    });

    expect(summarizeRefreshFailure(error)).toEqual({
      name: "TypeError",
      message: "fetch failed",
    });
  });

  it("ignores fields of the wrong type rather than logging them", () => {
    expect(
      summarizeRefreshFailure({
        status: "400",
        error: { token: "secret" },
        error_description: ["secret"],
        message: 42,
      })
    ).toEqual({});
  });

  it("says only what kind of value was thrown when it is not an object", () => {
    expect(summarizeRefreshFailure("refresh_token=secret")).toEqual({
      thrown: "string",
    });
    expect(summarizeRefreshFailure(undefined)).toEqual({
      thrown: "undefined",
    });
    expect(summarizeRefreshFailure(null)).toEqual({ thrown: "null" });
  });
});

describe("logRefreshFailure", () => {
  it("logs the summary at error level, never through console.log", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});

    logRefreshFailure({
      status: 400,
      error: "invalid_grant",
      refresh_token: "secret-refresh",
    });

    expect(log).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]).toEqual([
      "Keycloak token refresh failed:",
      { status: 400, error: "invalid_grant" },
    ]);
  });
});
