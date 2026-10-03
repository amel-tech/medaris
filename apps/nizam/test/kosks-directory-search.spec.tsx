// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import type { KoskDirectoryResponse } from "@medaris/services/tedrisat";
import { NextIntlClientProvider } from "next-intl";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filtersFromParams } from "~/features/kosks/admin-present";
import { KosksDirectory } from "~/features/kosks/components/kosks-directory";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

// The page's search params arrive from the server, and a mocked router never
// answers: `filters` stays what it was while a navigation is "on its way", the
// state the typed search has to be right in.
const router = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("~/features/kosks/admin-actions", () => ({
  openKosk: vi.fn(),
  hideKosk: vi.fn(),
  restoreKosk: vi.fn(),
  addKoskNazims: vi.fn(),
}));
vi.mock("~/features/kosks/actions", () => ({ updateKosk: vi.fn() }));
vi.mock("~/features/madrasahs/actions", () => ({ lookupUserByEmail: vi.fn() }));

// A little over the search's pause (SEARCH_DELAY_MS = 300).
const PAUSE_MS = 350;

const empty: KoskDirectoryResponse = {
  items: [],
  total: 0,
  page: 1,
  limit: 12,
  counts: { all: 0, active: 0, passive: 0, hidden: 0 },
  fields: [],
};

let root: Root;
let host: HTMLElement;

const mount = async () => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root.render(
      <NextIntlClientProvider
        locale="tr"
        timeZone="Europe/Istanbul"
        messages={{ nizam: resources.tr.nizam } as never}
      >
        <KosksDirectory
          directory={empty}
          filters={filtersFromParams({})}
          viewerId={null}
          chief
        />
      </NextIntlClientProvider>
    );
  });
};

const type = async (text: string) => {
  const input = host.querySelector<HTMLInputElement>("input[name=q]");
  if (!input) throw new Error("no search field");
  await act(async () => {
    // React reads the value through the element's own setter.
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )?.set?.call(input, text);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

const clickChip = async (label: string) => {
  const chip = [...host.querySelectorAll<HTMLElement>("button[aria-pressed]")]
    .filter((b) => b.textContent === label)
    .at(0);
  if (!chip) throw new Error(`no chip ${label}`);
  await act(async () => chip.click());
};

const pause = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, PAUSE_MS));
  });

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe("KosksDirectory search (nizam 09)", () => {
  it("navigates once, after the pause, with the typed text", async () => {
    await mount();
    await type("abc");
    expect(router.replace).not.toHaveBeenCalled();
    await pause();
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith("/tr/kosks?q=abc");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("keeps a chip clicked while the text is still being typed", async () => {
    await mount();
    await type("abc");
    await clickChip("Listelenmeyen");
    expect(router.push).toHaveBeenLastCalledWith(
      "/tr/kosks?gorunurluk=listelenmeyen"
    );
    // the server has not answered the click yet: `filters` is the old ones
    await pause();
    expect(router.replace).toHaveBeenLastCalledWith(
      "/tr/kosks?gorunurluk=listelenmeyen&q=abc"
    );
  });

  it("keeps the search a chip is clicked right after", async () => {
    await mount();
    await type("abc");
    await pause();
    expect(router.replace).toHaveBeenLastCalledWith("/tr/kosks?q=abc");
    // the search has not come back from the server yet
    await clickChip("Listelenmeyen");
    expect(router.push).toHaveBeenLastCalledWith(
      "/tr/kosks?gorunurluk=listelenmeyen&q=abc"
    );
  });
});
