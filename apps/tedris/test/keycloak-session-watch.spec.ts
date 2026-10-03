// @vitest-environment happy-dom
import { act, createElement, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "./dom";

/**
 * MDRS-210, the client half: a page whose session Keycloak ended while it was
 * open (a sign-out in another Medaris app) is reloaded, so its server-rendered
 * parts stop showing the old account. Hidden tabs wait until they are shown.
 */
type Status = "loading" | "authenticated" | "unauthenticated";
const state = vi.hoisted(() => ({ status: "loading" as string }));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ status: state.status }),
}));

let visibility: DocumentVisibilityState = "visible";
let setStatus: (status: Status) => Promise<void>;
const reload = vi.fn();

beforeEach(() => {
  visibility = "visible";
  state.status = "loading";
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    get: () => visibility,
  });
});

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

const mount = async (initial: Status) => {
  const { KeycloakSessionWatch } = await import(
    "@medaris/services/auth-client"
  );
  state.status = initial;
  function Harness() {
    const [, rerender] = useState(0);
    setStatus = async (status) => {
      await act(async () => {
        state.status = status;
        rerender((n) => n + 1);
      });
    };
    return createElement(KeycloakSessionWatch, { reload });
  }
  await render(createElement(Harness));
};

const show = async () => {
  visibility = "visible";
  await act(async () => {
    document.dispatchEvent(new Event("visibilitychange"));
  });
};

describe("KeycloakSessionWatch", () => {
  it("reloads a visible page once its session has ended", async () => {
    await mount("authenticated");
    await setStatus("unauthenticated");
    expect(reload).toHaveBeenCalledTimes(1);

    await show();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("never reloads a page that was loaded without a session", async () => {
    await mount("loading");
    await setStatus("unauthenticated");
    await show();
    expect(reload).not.toHaveBeenCalled();
  });

  it("leaves a signed-in page alone", async () => {
    await mount("loading");
    await setStatus("authenticated");
    expect(reload).not.toHaveBeenCalled();
  });

  it("waits until a hidden tab is shown", async () => {
    await mount("authenticated");
    visibility = "hidden";
    await setStatus("unauthenticated");
    expect(reload).not.toHaveBeenCalled();

    await show();
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing if the session came back before the tab was shown", async () => {
    await mount("authenticated");
    visibility = "hidden";
    await setStatus("unauthenticated");
    await setStatus("authenticated");

    await show();
    expect(reload).not.toHaveBeenCalled();
  });
});
