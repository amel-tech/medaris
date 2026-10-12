// @vitest-environment happy-dom
import { resources } from "@medaris/i18n";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FileErrorNotice } from "~/features/courses/components/file-error-notice";
import { cleanup, render } from "./dom";

// MDRS-287: a refused download comes back to the curriculum with
// `?fileError=<reason>` (the redirect is @medaris/services/file-proxy's). The
// page says why once, in a toast that stays until closed, and takes the
// parameter off the address.

const toast = vi.hoisted(() => ({ error: vi.fn() }));
vi.mock("@medaris/ui/components/sonner", () => ({ toast }));

const words = resources.tr.nizam.Curriculum.downloadErrors;
const PAGE = "/tr/kosks/k1/courses/c1/curriculum";

beforeEach(() => toast.error.mockClear());
afterEach(async () => {
  await cleanup();
  window.history.replaceState(null, "", "/");
});

const mountAt = async (address: string) => {
  window.history.replaceState(null, "", address);
  await render(
    <NextIntlClientProvider
      locale="tr"
      messages={{ nizam: resources.tr.nizam }}
    >
      <FileErrorNotice />
    </NextIntlClientProvider>
  );
};

describe("FileErrorNotice", () => {
  it("says why once and takes ?fileError= off the address", async () => {
    await mountAt(`${PAGE}?fileError=unavailable`);
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(words.title, {
      id: "file-error",
      description: words.unavailable,
    });
    expect(window.location.pathname).toBe(PAGE);
    expect(window.location.search).toBe("");
  });

  it("says nothing for a reason it does not know, or without one", async () => {
    await mountAt(`${PAGE}?fileError=%3Cscript%3E`);
    expect(window.location.search).toBe("");
    await cleanup();
    await mountAt(PAGE);
    expect(toast.error).not.toHaveBeenCalled();
  });
});
