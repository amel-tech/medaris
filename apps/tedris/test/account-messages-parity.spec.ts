import { readFileSync } from "node:fs";
import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import { TIME_ZONE_PRESETS } from "~/features/account/profile-model";
import { APPLICATION_FIELDS } from "~/features/kosk-application/model";
import { HIDEABLE_FIELDS } from "~/features/public-profile/model";

/**
 * `tedrisAccount` is read through `lib/i18n/loose.ts`, outside the typed
 * catalogue (the types would hit TS2589), so what the types would catch is
 * pinned here: the three languages carry the same keys, every literal key the
 * code asks for exists, and every key built at run time has its entry.
 */
type Tree = { [key: string]: string | Tree };
const flatten = (node: Tree, prefix = ""): string[] =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === "string" ? [prefix + k] : flatten(v, `${prefix}${k}.`)
  );
const catalogue = (locale: "tr" | "en" | "ar") =>
  resources[locale].tedrisAccount as unknown as Tree;

const SOURCES: Record<string, string> = {
  AccountProfile: "features/account/components/account-settings.tsx",
  PublicProfile: "features/public-profile/components/public-profile-page.tsx",
  KoskApplication:
    "features/kosk-application/components/kosk-application-page.tsx",
};
const PAGES: Record<string, string[]> = {
  AccountProfile: [],
  PublicProfile: ["app/[locale]/account/public-profile/page.tsx"],
  KoskApplication: ["app/[locale]/kosk-applications/new/page.tsx"],
};

describe("tedrisAccount messages (MDRS-166)", () => {
  it("has the same keys in tr, en and ar", () => {
    const tr = flatten(catalogue("tr")).sort();
    expect(flatten(catalogue("en")).sort()).toEqual(tr);
    expect(flatten(catalogue("ar")).sort()).toEqual(tr);
  });

  for (const [namespace, file] of Object.entries(SOURCES)) {
    it(`${namespace}: every literal key the code asks for exists`, () => {
      const keys = new Set(flatten(catalogue("tr")));
      const source = [file, ...PAGES[namespace]]
        .map((f) => readFileSync(`${__dirname}/../${f}`, "utf8"))
        .join("\n");
      const asked = [...source.matchAll(/\bt[p]?\(\s*"([A-Za-z0-9_.]+)"/g)].map(
        (m) => `${namespace}.${m[1]}`
      );
      expect(asked.length).toBeGreaterThan(5);
      for (const key of asked) {
        expect(keys.has(key), key).toBe(true);
      }
    });
  }

  it("has an entry for every key built at run time", () => {
    const keys = new Set(flatten(catalogue("tr")));
    for (const p of TIME_ZONE_PRESETS)
      expect(keys.has(`AccountProfile.zones.${p.id}`), p.id).toBe(true);
    for (const f of APPLICATION_FIELDS)
      expect(keys.has(`KoskApplication.fields.${f.key}`), f.key).toBe(true);
    for (const f of HIDEABLE_FIELDS)
      expect(keys.has(`PublicProfile.hidden.${f}`), f).toBe(true);
    // Hesap's page reads these two through the AccountProfile namespace.
    for (const k of ["profileFailedTitle", "profileFailed"])
      expect(keys.has(`AccountProfile.${k}`), k).toBe(true);
    for (const f of ["name", "field", "summary", "reason", "email", "phone"])
      expect(keys.has(`KoskApplication.errors.${f}`), f).toBe(true);
  });
});
