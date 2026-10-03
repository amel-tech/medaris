// @vitest-environment happy-dom
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "./dom";

/** The segments that mount the calendar menu must not crash for want of a toast provider (MDRS-163). */
afterEach(async () => {
  await cleanup();
});

describe("ToastHost", () => {
  it("lets a child call useToaster without a provider above it", async () => {
    const { useToaster } = await import("@medaris/ui/mds/toast");
    const { ToastHost } = await import("~/components/toast-host");
    const Probe = () => {
      useToaster();
      return createElement("p", null, "ok");
    };
    const view = await render(
      createElement(ToastHost, null, createElement(Probe))
    );
    expect(document.body.textContent).toContain("ok");
    void view;
  });
});
