// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import tailwindcss from "@tailwindcss/postcss";
import postcss from "postcss";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * tedris draws every page with one Tailwind build (MDRS-281).
 *
 * It used to load the shadcn kit's @medaris/ui/globals.css in the locale
 * layout and the design system's @medaris/ui/medaris.css again in each
 * segment on the system: two builds, each declaring its own copy of most
 * utility classes, and the second copy, later in the same layer, won. The
 * system's build has one breakpoint, so on those pages its plain
 * `grid-cols-3` beat the kit's `max-lg:grid-cols-2`, and the decks grid kept
 * three columns at 800 px.
 *
 * The spec reads the stylesheets the app imports, compiles each the way
 * `next build` does (PostCSS with @tailwindcss/postcss), and asks that no two
 * of the sheets a page under the locale layout loads declare the same
 * utility, that every breakpoint utility the app's code uses is built, and
 * that the sheets write the same layer order, so the order they load in
 * decides nothing.
 */

const APP = resolve(__dirname, "..");
const require = createRequire(join(APP, "package.json"));

/** Documents drawn without the locale layout: each loads one sheet of its own. */
const STANDALONE = ["app/not-found.tsx", "app/global-error.tsx"];

const walk = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return walk(path);
    return /\.(tsx?|css)$/.test(entry.name) ? [path] : [];
  });

const SOURCES = ["app", "components", "features", "lib"].flatMap((d) =>
  walk(join(APP, d))
);

/** The stylesheets a source file imports for their side effect, as files. */
const sheetsImportedBy = (file: string): string[] =>
  [...readFileSync(file, "utf8").matchAll(/^import\s+"([^"]+\.css)";/gm)].map(
    ([, specifier]) =>
      specifier?.startsWith(".")
        ? resolve(dirname(file), specifier)
        : require.resolve(specifier as string)
  );

const LOCALE_SHEETS = [
  ...new Set(
    SOURCES.filter(
      (f) => /\.tsx?$/.test(f) && !STANDALONE.includes(relative(APP, f))
    ).flatMap(sheetsImportedBy)
  ),
];

const compile = async (file: string) =>
  (
    await postcss([tailwindcss({ base: APP, optimize: false })]).process(
      readFileSync(file, "utf8"),
      { from: file }
    )
  ).css;

/** The class names a compiled sheet declares inside its utilities layer. */
const utilitiesOf = (css: string): Set<string> => {
  const names = new Set<string>();
  for (const start of css.matchAll(/@layer utilities\s*\{/g)) {
    let depth = 1;
    let i = (start.index as number) + start[0].length;
    const from = i;
    while (depth > 0 && i < css.length) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    for (const [, prelude] of css.slice(from, i).matchAll(/([^{};]+)\{/g)) {
      if (prelude?.trim().startsWith("@")) continue;
      for (const [, name] of (prelude as string).matchAll(
        /\.((?:\\.|[\w-])+)/g
      )) {
        names.add((name as string).replace(/\\(.)/g, "$1"));
      }
    }
  }
  return names;
};

/** The breakpoint utilities written in the app's code: `md:…`, `max-lg:…`. */
const RESPONSIVE = [
  ...new Set(
    SOURCES.filter((f) => /\.tsx?$/.test(f)).flatMap((f) =>
      [
        ...readFileSync(f, "utf8").matchAll(
          /(?<=["'`\s])((?:max-)?(?:sm|md|lg|xl|2xl):[\w[\]().,%/#:-]+)(?=["'`\s])/g
        ),
      ].map(([, name]) => name as string)
    )
  ),
].sort();

const layerOrder = (file: string) =>
  /@layer\s+([\w\s,-]+);/.exec(readFileSync(file, "utf8"))?.[1]?.trim();

let compiled: { file: string; utilities: Set<string> }[];

beforeAll(async () => {
  compiled = await Promise.all(
    LOCALE_SHEETS.map(async (file) => ({
      file,
      utilities: utilitiesOf(await compile(file)),
    }))
  );
}, 60_000);

describe("the stylesheets of a tedris page", () => {
  it("build utilities in one sheet only", () => {
    const building = compiled
      .filter((s) => s.utilities.size > 0)
      .map((s) => relative(APP, s.file));
    expect(building).toHaveLength(1);
  });

  it("never declare a utility twice, so no copy shadows another", () => {
    const twice: string[] = [];
    for (const [i, a] of compiled.entries()) {
      for (const b of compiled.slice(i + 1)) {
        for (const name of a.utilities) {
          if (b.utilities.has(name)) twice.push(name);
        }
      }
    }
    // The ones that hurt first: a breakpoint variant whose plain class is
    // declared again in another sheet loses to it.
    const shadowing = RESPONSIVE.filter((r) =>
      twice.includes(r.replace(/^(?:max-)?(?:sm|md|lg|xl|2xl):/, ""))
    );
    expect({ shadowing, twice: twice.length }).toEqual({
      shadowing: [],
      twice: 0,
    });
  });

  it("build every breakpoint utility the app's code uses", () => {
    expect(RESPONSIVE.length).toBeGreaterThan(0);
    const built = new Set(compiled.flatMap((s) => [...s.utilities]));
    expect(RESPONSIVE.filter((name) => !built.has(name))).toEqual([]);
  });

  it("write one layer order, whichever sheet the browser reads first", () => {
    const orders = new Set(
      [
        ...LOCALE_SHEETS,
        require.resolve("@medaris/ui/medaris-components.css"),
      ].map(layerOrder)
    );
    expect([...orders]).toEqual([
      "theme, base, mds-base, components, utilities",
    ]);
  });

  it("leave each standalone document one sheet of its own", () => {
    for (const doc of STANDALONE) {
      expect(sheetsImportedBy(join(APP, doc))).toHaveLength(1);
    }
  });
});
