import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import Page from "../app/[locale]/cerezler/page";
import { cookieGroups } from "../content/cerezler";

vi.mock("next-intl/server", () => ({ setRequestLocale: () => undefined }));

const REPO = join(__dirname, "..", "..", "..");
const source = (path: string) => readFileSync(join(REPO, path), "utf8");

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
      "tedris.session",
      "tedris.auth-flow.",
      "tedris.auth-starts",
      "KEYCLOAK_IDENTITY",
      "medaris-tz",
      "nazar-scope",
      "medaris-theme",
    ]) {
      expect(page).toContain(name);
    }
    for (const row of cookieGroups.flatMap((g) => g.rows)) {
      expect(row.lifetime).not.toBe("");
    }
  });

  // #285: one session package for tedris, nizam and nazar. The spec reads its
  // cookie names and storage keys, so a renamed one fails here.
  it("lists @medaris/auth's cookies under each app's prefix", async () => {
    const page = await text();
    const config = source("libs/auth/src/server/config.ts");
    const suffixes = [...config.matchAll(/\bname\("([a-z.-]+)"\)/g)].map(
      (m) => m[1]
    );
    expect(suffixes).toEqual(["session", "auth-flow.", "auth-starts"]);
    for (const app of ["tedris", "nizam", "nazar"]) {
      const prefix = source(`apps/${app}/lib/auth.ts`).match(
        /cookiePrefix: "([a-z-]+)"/
      )?.[1];
      expect(prefix).toBe(app);
      for (const suffix of suffixes) {
        expect(page).toContain(`${prefix}.${suffix}`);
      }
    }
    expect(page).toContain("__Host-");
  });

  it("lists every storage key of @medaris/auth's sign-in", async () => {
    const page = await text();
    const keys = [
      ...source("libs/auth/src/client/sign-in.ts").matchAll(
        /"(medaris\.auth\.[a-z-]+)"/g
      ),
    ].map((m) => m[1]);
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
      expect(page).toContain(key);
    }
  });

  it("no longer lists next-auth's cookies nor tedris.welcomed (#285)", async () => {
    const page = await text();
    for (const gone of [
      "session-token",
      "csrf-token",
      "callback-url",
      "pkce.code_verifier",
      "tedris.welcomed",
    ]) {
      expect(page).not.toContain(gone);
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
