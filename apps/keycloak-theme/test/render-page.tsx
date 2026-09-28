/**
 * Renders one login page the way Keycloak would serve it, into happy-dom
 * (MDRS-100). Used by `pages.spec.tsx`; needs the happy-dom environment.
 */

import type { DeepPartial } from "keycloakify/tools/DeepPartial";
import { act } from "react";
import { createRoot } from "react-dom/client";
import type { KcContext } from "../src/login/KcContext";
import KcPage from "../src/login/KcPage";
import { getKcContextMock } from "../src/login/KcPageStory";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

export type PageId = KcContext["pageId"];

export type RenderedPage = {
  kcContext: KcContext;
  unmount: () => void;
};

const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

/**
 * Mounts the page and waits until it stops changing: the non-English message
 * set arrives through a dynamic import, and the profile fields are `lazy()`,
 * so the first commit is neither translated nor complete.
 */
export async function renderPage(
  pageId: PageId,
  languageTag: string,
  overrides: DeepPartial<KcContext> = {}
): Promise<RenderedPage> {
  const kcContext = getKcContextMock({
    pageId,
    overrides: {
      ...overrides,
      locale: { currentLanguageTag: languageTag },
    } as never,
  }) as KcContext;

  document.body.innerHTML = '<div id="root"></div>';
  const container = document.getElementById("root");
  if (container === null) {
    throw new Error("no #root");
  }
  const root = createRoot(container);

  await act(async () => {
    root.render(<KcPage kcContext={kcContext} />);
  });

  let previous = "";
  let stableTicks = 0;
  for (let i = 0; i < 200 && stableTicks < 3; i++) {
    await tick();
    const html = document.body.innerHTML;
    const ready = document.getElementById("kc-page-title") !== null;
    stableTicks = ready && html === previous ? stableTicks + 1 : 0;
    previous = html;
  }
  if (stableTicks < 3) {
    throw new Error(`${pageId} (${languageTag}) never settled`);
  }

  return {
    kcContext,
    unmount: () => {
      act(() => root.unmount());
    },
  };
}

/**
 * Hidden the way this theme hides things: Tailwind's `hidden` class (happy-dom
 * applies no Tailwind CSS), the `hidden` attribute, or an inline display:none.
 * The profile form keeps Keycloak's `locale` field that way.
 */
export const isHidden = (element: Element | null): boolean => {
  for (let e = element; e !== null; e = e.parentElement) {
    if (
      e.classList.contains("hidden") ||
      e.hasAttribute("hidden") ||
      (e as HTMLElement).style?.display === "none"
    ) {
      return true;
    }
  }
  return false;
};

/** Every piece of copy a visitor can see or hear on the current page. */
export function visibleStrings(): string[] {
  const strings: string[] = [document.title];
  const walker = document.createTreeWalker(document.body, 4 /* SHOW_TEXT */);
  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    const parent = node.parentElement;
    if (
      parent === null ||
      ["SCRIPT", "STYLE"].includes(parent.tagName) ||
      isHidden(parent)
    ) {
      continue;
    }
    strings.push(node.textContent ?? "");
  }
  for (const element of document.body.querySelectorAll("*")) {
    if (isHidden(element)) {
      continue;
    }
    for (const attribute of ["placeholder", "aria-label", "title", "alt"]) {
      const value = element.getAttribute(attribute);
      if (value !== null) {
        strings.push(value);
      }
    }
  }
  return strings.map((s) => s.trim()).filter((s) => /\p{L}/u.test(s));
}

/** String leaves of the mock context: data the server supplies, not copy. */
export function contextStrings(value: unknown, out = new Set<string>()) {
  if (typeof value === "string") {
    if (value.trim() !== "") {
      out.add(value.trim());
    }
  } else if (Array.isArray(value)) {
    for (const item of value) {
      contextStrings(item, out);
    }
  } else if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) {
      contextStrings(item, out);
    }
  }
  return out;
}
