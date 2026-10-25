// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileErrorNotice } from "~/features/courses/components/file-error-notice";
import { cleanup, render } from "./dom";

/**
 * A refused download comes back to its page with `?fileError=<reason>`
 * (MDRS-287, MDRS-290; the redirect is @medaris/services/file-proxy's): the
 * course and celse pages say why once, in a toast that stays until closed,
 * and take the parameter off the address.
 */
const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));

const labels = resources.tr.tedrisLearn.FileDownload;
const PAGE = "/courses/c1/lessons/l1";

beforeEach(() => toast.error.mockClear());
afterEach(async () => {
  await cleanup();
  window.history.replaceState(null, "", "/");
});

const mountAt = async (address: string) => {
  window.history.replaceState(null, "", address);
  await render(createElement(FileErrorNotice, { labels }));
};

describe("FileErrorNotice", () => {
  it.each([
    ["forbidden", labels.forbidden],
    ["notFound", labels.notFound],
    ["unavailable", labels.unavailable],
    ["failed", labels.failed],
  ])("says %s once and takes it off the address", async (reason, text) => {
    await mountAt(`${PAGE}?tab=x&fileError=${reason}`);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(labels.title, {
      id: "file-error",
      description: text,
    });
    expect(`${window.location.pathname}${window.location.search}`).toBe(
      `${PAGE}?tab=x`
    );
  });

  it("says nothing for a reason it does not know, and still cleans the address", async () => {
    await mountAt(`${PAGE}?fileError=RESOURCE_FILE_NOT_FOUND`);
    expect(toast.error).not.toHaveBeenCalled();
    expect(window.location.search).toBe("");
  });

  it("says nothing on a page without one", async () => {
    await mountAt(`${PAGE}?tab=x`);
    expect(toast.error).not.toHaveBeenCalled();
    expect(window.location.search).toBe("?tab=x");
  });
});
