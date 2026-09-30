/**
 * MDRS-73 — every new value is an extracted one, and each file says where it
 * came from. The issue asks for headers "so the next person can tell an
 * extracted value from an invented one"; this pins that promise.
 *
 * The reference is the committed mirror of the design system
 * (design-system/, MDRS-92), which was extracted from the same .fig export,
 * plus the numbers the issue itself lists. A mirror refresh that changes a
 * value turns this red on purpose: the tokens are then stale.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FAMILIES, HAND_AUTHORED_FILES, NEW_TOKEN_NAMES } from "./families.js";
import {
  collectTokens,
  declarationMap,
  normaliseShadow,
  PACKAGE_ROOT,
  parseColour,
  REPO_ROOT,
  readDeclarations,
  resolveTokensCss,
  toPx,
} from "./support/css-tokens.js";

const mirrorFile = (file: string) =>
  readFileSync(join(REPO_ROOT, "design-system/tokens", file), "utf8");
const themeFile = (file: string) =>
  readFileSync(join(PACKAGE_ROOT, "theme", file), "utf8");

/** our name -> [mirror file, mirror name] */
function mirrorOf(name: string): [string, string] {
  const rules: [RegExp, string, (m: RegExpMatchArray) => string][] = [
    [/^font-cairo$/, "typography.css", () => "font-display"],
    [/^font-ibm-plex-sans$/, "typography.css", () => "font-ui"],
    [/^font-weight-(.+)$/, "typography.css", (m) => `weight-${m[1]}`],
    [/^text-(.+)$/, "typography.css", (m) => `fs-${m[1]}`],
    [/^line-height-(.+)$/, "typography.css", (m) => `lh-${m[1]}`],
    [/^letter-spacing-(.+)$/, "typography.css", (m) => `tracking-${m[1]}`],
    [/^space-(.+)$/, "spacing.css", (m) => `space-${m[1]}`],
    [/^bp-(.+)$/, "spacing.css", (m) => `bp-${m[1]}`],
    [/^corner-radius-(.+)$/, "borders.css", (m) => `radius-${m[1]}`],
    [/^border-weight-(.+)$/, "borders.css", (m) => `border-${m[1]}`],
    [/^shadow-(focus.*)$/, "elevation.css", (m) => `ring-${m[1]}`],
    [/^shadow-(.+)$/, "elevation.css", (m) => `shadow-${m[1]}`],
    [
      /^icon-color-neutralinverse-(.+)$/,
      "semantic.css",
      (m) => `icon-neutral-inverse-${m[1]}`,
    ],
    [/^icon-color-(.+)$/, "semantic.css", (m) => `icon-${m[1]}`],
  ];
  for (const [pattern, file, rename] of rules) {
    const match = name.match(pattern);
    if (match) return [file, rename(match)];
  }
  throw new Error(`--${name} has no Figma source`);
}

const isLength = (v: string) => /^-?\d*\.?\d+(px|rem)$/.test(v);

describe("the new tokens trace to Figma", () => {
  it("every hand-authored file names its Figma source and its mirror file", () => {
    for (const file of HAND_AUTHORED_FILES) {
      const header = themeFile(file).match(/^\/\*[\s\S]*?\*\//)?.[0] ?? "";
      expect(header, file).toMatch(/HAND-AUTHORED/);
      expect(header, file).toMatch(/Figma (variable collection|effect styles)/);
      expect(header, file).toMatch(/Online Medrese UI UX\.fig/);
      const mirror = header.match(/design-system\/tokens\/[a-z-]+\.css/)?.[0];
      expect(mirror, file).toBeDefined();
      expect(
        existsSync(join(REPO_ROOT, mirror as string)),
        `${file} -> ${mirror}`
      ).toBe(true);
    }
    expect(themeFile("index.css")).toMatch(/main\.css is GENERATED/);
  });

  it("every new value equals the mirror's, and proposals are labelled as such", () => {
    const tokens = collectTokens(resolveTokensCss());
    const ourNotes = new Map(
      HAND_AUTHORED_FILES.flatMap((f) =>
        readDeclarations(themeFile(f)).map((d) => [d.name, d.note] as const)
      )
    );
    for (const name of NEW_TOKEN_NAMES.filter(
      (n) => !n.startsWith("icon-color-")
    )) {
      const [file, mirrorName] = mirrorOf(name);
      const mirror = readDeclarations(mirrorFile(file)).find(
        (d) => d.name === mirrorName
      );
      expect(mirror, `--${name} -> ${file} --${mirrorName}`).toBeDefined();
      const theirs = mirror as { value: string; note: string };
      const ours = (tokens.get(name) as { value: string }).value;
      if (name.startsWith("shadow-")) {
        // Same layers, same 8-bit alpha; see the elevation.css header.
        expect(normaliseShadow(ours), `--${name}`).toEqual(
          normaliseShadow(theirs.value)
        );
      } else if (isLength(ours)) {
        expect(toPx(ours), `--${name}`).toBe(toPx(theirs.value));
      } else {
        expect(ours.toLowerCase(), `--${name}`).toBe(
          theirs.value.toLowerCase()
        );
      }
      expect(
        /PROPOSAL/.test(ourNotes.get(name) as string),
        `--${name} proposal label`
      ).toBe(/proposed/i.test(theirs.note));
    }
  });

  it("every icon colour is the primitive the mirror names, as the Figma export writes it", () => {
    const tokens = collectTokens(resolveTokensCss());
    const semantic = declarationMap(mirrorFile("semantic.css"));
    const primitives = declarationMap(mirrorFile("colors.css"));
    const exported = declarationMap(
      readFileSync(join(PACKAGE_ROOT, "input/main.css"), "utf8").replace(
        /^\/\*|\*\/\s*$/g,
        ""
      )
    );
    for (const name of FAMILIES.icon.names) {
      const [, mirrorName] = mirrorOf(name);
      const primitive = (semantic.get(mirrorName) as string).match(
        /^var\(--(.+)\)$/
      )?.[1] as string;
      const ours = (tokens.get(name) as { value: string }).value;
      expect(parseColour(ours), `--${name} vs ${primitive}`).toEqual(
        parseColour(primitives.get(primitive) as string)
      );
      expect(ours, `--${name} vs input/main.css`).toBe(
        exported.get(`color-primitives-${primitive}`)
      );
    }
    const mirrorIcons = [...semantic.keys()].filter((n) =>
      n.startsWith("icon-")
    );
    expect(mirrorIcons.length).toBe(FAMILIES.icon.names.length);
  });

  it("carries exactly the scales the issue lists", () => {
    const tokens = collectTokens(resolveTokensCss());
    const px = (prefix: string) =>
      [...tokens]
        .filter(([n]) => n.startsWith(prefix))
        .map(([, t]) => toPx(t.value));
    expect(px("space-")).toEqual([4, 8, 16, 24, 32, 40, 56, 64]);
    expect(px("bp-")).toEqual([390, 768, 1440]);
    expect(px("corner-radius-")).toEqual([4, 6, 8, 12, 20, 30, 999]);
    expect(px("border-weight-")).toEqual([0.5, 1, 2, 4]);
    const sizes = FAMILIES.type.names
      .filter((n) => n.startsWith("text-"))
      .map((n) => toPx((tokens.get(n) as { value: string }).value));
    expect(sizes).toHaveLength(12);
    expect([Math.min(...sizes), Math.max(...sizes)]).toEqual([10, 72]);
    expect(
      FAMILIES.type.names.filter((n) => n.startsWith("font-weight-"))
    ).toHaveLength(8);
    expect(tokens.get("font-cairo")?.value).toMatch(/^"Cairo",/);
    expect(tokens.get("font-ibm-plex-sans")?.value).toMatch(
      /^"IBM Plex Sans",/
    );
  });

  it("refuses a name it has no Figma source for", () => {
    expect(() => mirrorOf("not-a-token")).toThrow(/no Figma source/);
  });
});
