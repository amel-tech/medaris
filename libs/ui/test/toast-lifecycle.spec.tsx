// @vitest-environment happy-dom
import { act, useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  DismissStaleSonnerToasts,
  Toaster as SonnerToaster,
  toast,
} from "../src/components/sonner";
import { AppProviders } from "../src/mds/app-providers";
import { type NotifyOptions, useToaster } from "../src/mds/toast";
import { cleanup, render, settle } from "./render";

/**
 * MDRS-214: a toast must not outlive the action it reports. On a route change
 * every toast that was on screen when the user last acted goes; the toast the
 * navigation was for (fired after that action) stays; a toast re-fired under
 * the same id replaces the earlier one in place.
 */

afterEach(async () => {
  toast.dismiss();
  await settle(50);
  await cleanup();
});

const body = () => document.body;

let navigate: (to: string) => void = () => {};
let notify: (options: NotifyOptions) => string = () => "";

/** The user presses something: a link, a submit button, a key. */
async function userActs() {
  await act(async () => {
    window.dispatchEvent(new Event("pointerdown"));
  });
}

async function goTo(path: string) {
  await act(async () => navigate(path));
  await settle(50);
}

function MdsHarness() {
  const [path, setPath] = useState("/kosks/1/dersler/yeni");
  navigate = setPath;
  return (
    <AppProviders routeKey={path}>
      <Notifier />
    </AppProviders>
  );
}

function Notifier() {
  notify = useToaster().notify;
  return null;
}

/** Toasts that are on screen and not on their way out. */
const mdsToasts = () =>
  [...body().querySelectorAll(".mds-toast")].filter(
    (t) => !t.hasAttribute("data-ending-style")
  );

describe("the unified kit's toaster across navigation", () => {
  it("closes an error toast from before the user's last action when the page changes", async () => {
    await render(<MdsHarness />);
    await act(async () => {
      notify({ tone: "error", title: "Ders açılamadı" });
    });
    await settle();
    expect(mdsToasts().map((t) => t.textContent)).toEqual(["Ders açılamadı"]);

    await userActs();
    await goTo("/kosks/1/dersler");

    expect(mdsToasts()).toEqual([]);
  });

  it("keeps the toast the navigation was for: fired after the user's last action", async () => {
    await render(<MdsHarness />);
    await userActs();
    await act(async () => {
      notify({ title: "Ders açıldı" });
    });
    await goTo("/kosks/1/dersler");

    expect(mdsToasts().map((t) => t.textContent)).toEqual(["Ders açıldı"]);

    await userActs();
    await goTo("/kosks/1/talebeler");
    expect(mdsToasts()).toEqual([]);
  });

  it("replaces an action's error with its success when both carry the action's id", async () => {
    await render(<MdsHarness />);
    await act(async () => {
      notify({ id: "courses:create", tone: "error", title: "Ders açılamadı" });
    });
    await settle();
    await userActs();
    await act(async () => {
      notify({ id: "courses:create", title: "Ders açıldı" });
    });
    await settle();

    expect(mdsToasts().map((t) => t.textContent)).toEqual(["Ders açıldı"]);
    expect(mdsToasts()[0]?.className).toContain("mds-toast--success");

    await goTo("/kosks/1/dersler");
    expect(mdsToasts().map((t) => t.textContent)).toEqual(["Ders açıldı"]);
  });

  it("leaves toasts alone when the app passes no routeKey", async () => {
    await render(
      <AppProviders>
        <Notifier />
      </AppProviders>
    );
    await act(async () => {
      notify({ tone: "error", title: "Ders açılamadı" });
    });
    await userActs();
    await settle();
    expect(mdsToasts().length).toBe(1);
  });
});

function SonnerHarness() {
  const [path, setPath] = useState("/courses/1");
  navigate = setPath;
  return (
    <>
      <DismissStaleSonnerToasts routeKey={path} />
      <SonnerToaster closeLabel="Kapat" />
    </>
  );
}

const sonnerToasts = () =>
  [...body().querySelectorAll("[data-sonner-toast]")].filter(
    (t) => t.getAttribute("data-removed") !== "true"
  );

describe("the Sonner toaster across navigation", () => {
  it("draws a close button on every toast", async () => {
    await render(<SonnerHarness />);
    await act(async () => {
      toast.success("İlerlemen güncellendi.");
    });
    await settle();
    const [shown] = sonnerToasts();
    expect(shown?.textContent).toContain("İlerlemen güncellendi.");
    expect(
      shown?.querySelector("[data-close-button]")?.getAttribute("aria-label")
    ).toBe("Kapat");
  });

  it("dismisses a toast from before the user's last action when the page changes", async () => {
    await render(<SonnerHarness />);
    await act(async () => {
      toast.success("İlerlemen güncellendi.");
    });
    await settle();
    expect(sonnerToasts().length).toBe(1);

    await userActs();
    await goTo("/courses/1/lessons/2");

    expect(sonnerToasts()).toEqual([]);
  });

  it("lets a success that reuses the error's id survive the redirect it announces", async () => {
    await render(<SonnerHarness />);
    await act(async () => {
      toast.error("Ders açılamadı", { id: "courses:create" });
    });
    await settle();
    await userActs();
    await act(async () => {
      toast.success("Ders açıldı", { id: "courses:create" });
    });
    await goTo("/kosks/1/dersler");

    const texts = sonnerToasts().map((t) => t.textContent ?? "");
    expect(texts.length).toBe(1);
    expect(texts[0]).toContain("Ders açıldı");
    expect(texts[0]).not.toContain("Ders açılamadı");
  });
});

describe("what DismissStaleSonnerToasts relies on in Sonner", () => {
  it("replaces a toast's object when it is re-fired under the same id", () => {
    toast.error("Ders açılamadı", { id: "pin:replace" });
    const before = toast.getToasts().find((t) => t.id === "pin:replace");
    toast.success("Ders açıldı", { id: "pin:replace" });
    const after = toast.getToasts().find((t) => t.id === "pin:replace");
    expect(before).toBeDefined();
    expect(after).toBeDefined();
    // `version: (t) => t` needs a new object; an upgrade that mutates in
    // place would make a replaced toast look stale and dismiss it.
    expect(after).not.toBe(before);
  });
});

describe("the Sonner toast's timing per tone (canvas rule 21)", () => {
  const last = () => toast.getToasts().at(-1) as { duration?: number };

  it("lets success and info close after 6 s and keeps warning and error", () => {
    toast.success("a");
    expect(last().duration).toBe(6000);
    toast.info("b");
    expect(last().duration).toBe(6000);
    toast.warning("c");
    expect(last().duration).toBe(Number.POSITIVE_INFINITY);
    toast.error("d");
    expect(last().duration).toBe(Number.POSITIVE_INFINITY);
    toast.error("e", { duration: 1000 });
    expect(last().duration).toBe(1000);
  });

  it("gives a success that re-fires an error's id its own 6 s", () => {
    toast.error("Ders açılamadı", { id: "pin:duration" });
    toast.success("Ders açıldı", { id: "pin:duration" });
    const t = toast.getToasts().find((x) => x.id === "pin:duration");
    expect(t?.duration).toBe(6000);
  });
});
