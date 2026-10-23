import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicPath } from "~/lib/public-paths";
import { homeHref } from "~/lib/shell-nav";
import proxy from "../proxy";

const appDir = join(__dirname, "..", "app");

describe("nizam's logo link (MDRS-101)", () => {
  it("points at a page that exists", () => {
    const dir = join(appDir, ...homeHref.split("/").filter(Boolean));
    const groups = existsSync(dir)
      ? readdirSync(dir, { withFileTypes: true })
          .filter((entry) => entry.isDirectory() && /^\(.+\)$/.test(entry.name))
          .map((entry) => join(dir, entry.name, "page.tsx"))
      : [];
    const pages = [join(dir, "page.tsx"), ...groups];
    expect(pages.some((page) => existsSync(page))).toBe(true);
  });

  it("is open to every visitor, signed in or not", () => {
    expect(isPublicPath(homeHref)).toBe(true);
  });

  it("is served as it is, with no language added to the address (MDRS-248)", async () => {
    const response = await proxy(
      new NextRequest(`http://localhost:4001${homeHref}`, {
        headers: { "accept-language": "en" },
      })
    );
    expect(response.headers.get("location")).toBeNull();
  });
});
