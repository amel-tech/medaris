import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { homeHref } from "~/components/layout/nav-routes";
import { isPublicPath } from "~/lib/public-paths";
import middleware from "../middleware";

const appDir = join(__dirname, "..", "app");

describe("nizam's logo link (MDRS-101)", () => {
  it("points at a page that exists under [locale]", () => {
    const page = join(
      appDir,
      "[locale]",
      ...homeHref.split("/").filter(Boolean),
      "page.tsx"
    );
    expect(existsSync(page)).toBe(true);
  });

  it("is open to every visitor, signed in or not", () => {
    expect(isPublicPath(homeHref)).toBe(true);
  });

  it("resolves through the middleware to a locale-prefixed page", async () => {
    const response = await middleware(
      new NextRequest(`http://localhost:4001${homeHref}`, {
        headers: { "accept-language": "tr" },
      })
    );
    // next-intl adds the locale; it does not send the visitor to sign in.
    const location = response.headers.get("location") ?? "";
    expect(new URL(location).pathname).toBe("/tr");
  });

  it("leaves no page outside [locale], where it could never resolve", () => {
    const strays = readdirSync(appDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => name !== "[locale]" && name !== "api")
      .filter((name) => existsSync(join(appDir, name, "page.tsx")));
    expect(strays).toEqual([]);
  });
});
