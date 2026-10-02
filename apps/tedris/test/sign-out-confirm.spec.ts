// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, click, render, settle } from "./dom";

const mocks = vi.hoisted(() => ({
  back: vi.fn(),
  push: vi.fn(),
  signOut: vi.fn<(idToken?: string) => Promise<void>>(),
}));
vi.mock("next-intl", async () => {
  const { resources } = await import("@medaris/i18n");
  return {
    useLocale: () => "tr",
    useTranslations: (namespace: string) => (name: string) =>
      [...namespace.split("."), ...name.split(".")].reduce<unknown>(
        (node, part) => (node as Record<string, unknown>)?.[part],
        resources.tr
      ),
  };
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ back: mocks.back, push: mocks.push }),
}));
vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: { idToken: "id-token-1" } }),
}));
vi.mock("~/lib/keycloak-logout", () => ({ keycloakSignOut: mocks.signOut }));

afterEach(async () => {
  await cleanup();
  vi.clearAllMocks();
});

const mount = async () => {
  const { SignOutConfirm } = await import("~/features/auth/sign-out-confirm");
  await render(createElement(SignOutConfirm));
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find(
      (b) => b.textContent === label
    ) as HTMLButtonElement;
  return { button };
};

describe("medaris/16: the sign-out confirmation", () => {
  it("shows the title, the sentence and the two buttons", async () => {
    const { button } = await mount();
    expect(document.querySelector("h1")?.textContent).toBe(
      "Çıkış yapılsın mı?"
    );
    expect(document.body.textContent).toContain(
      "Bu tarayıcıda Medaris’ten çıkarsın."
    );
    expect(button("Çıkış yap")).toBeDefined();
    expect(button("Vazgeç")).toBeDefined();
  });

  it("'Çıkış yap' signs out of both sessions with the id token and shows it is busy", async () => {
    mocks.signOut.mockReturnValue(new Promise(() => {}));
    const { button } = await mount();
    await click(button("Çıkış yap"));
    expect(mocks.signOut).toHaveBeenCalledWith("id-token-1");
    expect(button("Çıkış yap").getAttribute("aria-busy")).toBe("true");
    expect(
      button("Çıkış yap").querySelector(".mds-btn__spinner")
    ).not.toBeNull();
    expect(button("Vazgeç").disabled).toBe(true);
  });

  it("lets the button be pressed again when the sign-out did not start", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.signOut.mockRejectedValue(new Error("offline"));
    const { button } = await mount();
    await click(button("Çıkış yap"));
    await settle();
    expect(button("Çıkış yap").getAttribute("aria-busy")).toBeNull();
    log.mockRestore();
  });

  it("'Vazgeç' goes back without signing out", async () => {
    const { button } = await mount();
    await click(button("Vazgeç"));
    expect(mocks.signOut).not.toHaveBeenCalled();
    expect(mocks.back.mock.calls.length + mocks.push.mock.calls.length).toBe(1);
  });
});
