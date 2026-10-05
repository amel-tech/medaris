import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Page from "../app/[locale]/cerezler/page";
import { cookieGroups } from "../content/cerezler";

vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));

const text = async () =>
  renderToStaticMarkup(
    (await Page({ params: Promise.resolve({ locale: "tr" }) })) as ReactElement
  )
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("Çerezler", () => {
  it("shows no bracketed placeholder", async () => {
    expect(await text()).not.toMatch(/\[[^\]]+\]/);
  });

  it("lists every cookie the code sets, with a lifetime for each", async () => {
    const page = await text();
    for (const name of [
      "tedris.session-token",
      "csrf-token",
      "KEYCLOAK_IDENTITY",
      "medaris-tz",
      "tedris.welcomed",
      "nazir-scope",
      "medaris-theme",
    ]) {
      expect(page).toContain(name);
    }
    for (const row of cookieGroups.flatMap((g) => g.rows)) {
      expect(row.lifetime).not.toBe("");
    }
  });

  it("does not list the device cookie, which is not built yet (MDRS-125)", async () => {
    expect(await text()).not.toMatch(/Cihaz çerezi|cihaz tanımlayıcı/);
  });

  it("claims no analytics or advertising cookie", async () => {
    expect(await text()).toContain(
      "Analitik, ölçüm ya da reklam çerezi kullanılmaz"
    );
  });
});
