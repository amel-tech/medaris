import { act, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const mounted: Array<{ root: Root; host: HTMLElement }> = [];

/** Mounts one element into happy-dom and flushes effects. */
export async function render(el: ReactElement): Promise<HTMLElement> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  mounted.push({ root, host });
  await act(async () => {
    root.render(el);
  });
  return host;
}

export async function cleanup() {
  for (const { root, host } of mounted.splice(0)) {
    await act(async () => root.unmount());
    host.remove();
  }
  document.body.innerHTML = "";
}

export async function click(el: Element) {
  await act(async () => {
    (el as HTMLElement).click();
  });
}

export async function key(el: Element, k: string) {
  await act(async () => {
    el.dispatchEvent(
      new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })
    );
  });
}

export async function settle(ms = 20) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}
