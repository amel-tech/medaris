import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * medaris-components.css is medaris.css less Tailwind (MDRS-281): the same
 * tokens and the same class layer, without a theme or utilities, for an app
 * that builds its utilities once with the shadcn kit (tedris). The two must
 * not drift apart: a class-layer file added to one is added to the other.
 */

const STYLES = join(__dirname, "../src/styles");
const read = (file: string) =>
  readFileSync(join(STYLES, file), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
const imports = (css: string) =>
  [...css.matchAll(/@import\s+"([^"]+)"/g)].map(([, s]) => s as string);

describe("medaris-components.css", () => {
  const full = read("medaris.css");
  const components = read("medaris-components.css");

  it("brings the tokens and every class-layer file medaris.css brings", () => {
    const system = (list: string[]) =>
      list.filter(
        (s) => s.startsWith("./mds/") || s === "@medaris/tokens/medaris.css"
      );
    expect(system(imports(components))).toEqual(system(imports(full)));
  });

  it("brings no Tailwind: no theme, no utilities, no source to scan", () => {
    expect(imports(components).some((s) => s.includes("tailwind"))).toBe(false);
    expect(components).not.toMatch(/@source|@theme|@utility/);
  });

  it("puts the system's element defaults in their own layer, after the kit's base", () => {
    expect(components).toMatch(
      /@layer theme, base, mds-base, components, utilities;/
    );
    expect(components).toMatch(
      /@import "@medaris\/tokens\/medaris\.css" layer\(mds-base\);/
    );
  });
});
