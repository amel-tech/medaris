// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type StaleToastSource,
  useDismissStaleToasts,
} from "../src/hooks/use-dismiss-stale-toasts";
import { cleanup, render } from "./render";

/**
 * MDRS-214, the hook alone against a fake store: what is on screen at the
 * user's last interaction goes on the next route change, nothing else does.
 */

afterEach(cleanup);

interface FakeToast {
  id: string;
  rev: number;
}

/** A toast store the test drives by hand; `version` is `id:rev`. */
function fakeStore() {
  let toasts: FakeToast[] = [];
  const dismissed: string[] = [];
  const source: StaleToastSource<FakeToast> = {
    active: () => toasts,
    version: (t) => `${t.id}:${t.rev}`,
    dismiss: (t) => {
      dismissed.push(t.id);
      toasts = toasts.filter((x) => x.id !== t.id);
    },
  };
  return {
    source,
    dismissed,
    fire(id: string) {
      const prev = toasts.find((t) => t.id === id);
      toasts = prev
        ? toasts.map((t) => (t.id === id ? { id, rev: t.rev + 1 } : t))
        : [...toasts, { id, rev: 0 }];
    },
    ids: () => toasts.map((t) => t.id),
  };
}

let navigate: (to: string) => void = () => {};

function Harness({ source }: { source: StaleToastSource<FakeToast> }) {
  const [path, setPath] = useState("/a");
  navigate = setPath;
  useDismissStaleToasts(path, source);
  return null;
}

async function goTo(path: string) {
  await act(async () => navigate(path));
}

async function dispatch(type: "pointerdown" | "keydown" | "popstate") {
  await act(async () => {
    window.dispatchEvent(new Event(type));
  });
}

describe("useDismissStaleToasts", () => {
  it("dismisses a toast that was on screen at pointerdown when the route changes", async () => {
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    store.fire("error");
    await dispatch("pointerdown");
    await goTo("/b");
    expect(store.dismissed).toEqual(["error"]);
    expect(store.ids()).toEqual([]);
  });

  it("treats a keydown as an interaction too", async () => {
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    store.fire("error");
    await dispatch("keydown");
    await goTo("/b");
    expect(store.dismissed).toEqual(["error"]);
  });

  it("keeps a toast fired after pointerdown for one change and drops it on the next", async () => {
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    await dispatch("pointerdown");
    store.fire("success");
    await goTo("/b");
    expect(store.ids()).toEqual(["success"]);

    await dispatch("pointerdown");
    await goTo("/c");
    expect(store.dismissed).toEqual(["success"]);
  });

  it("keeps a toast re-fired under the same id after the interaction", async () => {
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    store.fire("courses:create");
    await dispatch("pointerdown");
    store.fire("courses:create");
    await goTo("/b");
    expect(store.dismissed).toEqual([]);
    expect(store.ids()).toEqual(["courses:create"]);
  });

  it("dismisses nothing while the route stays the same", async () => {
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    store.fire("error");
    await dispatch("pointerdown");
    await goTo("/a");
    await dispatch("pointerdown");
    expect(store.dismissed).toEqual([]);
    expect(store.ids()).toEqual(["error"]);
  });

  it("snapshots on popstate, which fires before the pathname reaches React", async () => {
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    await dispatch("pointerdown");
    store.fire("error");
    // Back button: no pointerdown inside the page, the URL changes, then React.
    await dispatch("popstate");
    await goTo("/previous");
    expect(store.dismissed).toEqual(["error"]);
  });

  it("removes its listeners when it unmounts", async () => {
    const remove = vi.spyOn(window, "removeEventListener");
    const store = fakeStore();
    await render(<Harness source={store.source} />);
    const active = vi.spyOn(store.source, "active");
    await cleanup();
    const removed = remove.mock.calls.map(([type]) => type);
    expect(removed).toEqual(
      expect.arrayContaining(["pointerdown", "keydown", "popstate"])
    );
    await dispatch("pointerdown");
    expect(active).not.toHaveBeenCalled();
    remove.mockRestore();
  });
});
