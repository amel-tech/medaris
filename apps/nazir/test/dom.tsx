import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

/**
 * Mounts a client component into happy-dom, for the few specs that need an
 * open menu or a click (a spec file asks for the DOM with a
 * `@vitest-environment happy-dom` docblock; the rest stay in node). happy-dom
 * lays nothing out, so these assert roles, attributes and behaviour.
 */
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

export async function render(element: ReactElement): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => {
    root.render(element);
  });
  return host;
}

export async function cleanup(): Promise<void> {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  document.body.innerHTML = "";
}

export async function click(element: Element): Promise<void> {
  await act(async () => {
    (element as HTMLElement).click();
  });
}

export async function key(element: Element, name: string): Promise<void> {
  await act(async () => {
    element.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: name,
        bubbles: true,
        cancelable: true,
      })
    );
  });
}

export async function settle(ms = 20): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
}
