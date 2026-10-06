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

/** Renders a new element into the root `render` made in `host`: the same page, read again. */
export async function rerender(
  host: HTMLElement,
  element: ReactElement
): Promise<void> {
  const entry = mounted.find((m) => m.host === host);
  if (!entry) throw new Error("rerender: nothing was rendered in this host");
  await act(async () => {
    entry.root.render(element);
  });
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

/** Types into a React-controlled input or textarea: the native setter, then the event React listens for. */
export async function type(element: Element, value: string): Promise<void> {
  const proto =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  await act(async () => {
    setter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
