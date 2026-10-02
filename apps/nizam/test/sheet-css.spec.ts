import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(
  resolve(__dirname, "../../../libs/ui/src/styles/mds/baseui.css"),
  "utf8"
);

/** The body of the last declaration block that opens with `selector {`. */
function rule(selector: string): string {
  const matches = [
    ...css.matchAll(new RegExp(`^${selector} \\{([^}]*)\\}`, "gm")),
  ];
  return matches.at(-1)?.[1] ?? "";
}

const zIndex = (selector: string) =>
  Number(/z-index:\s*(\d+)/.exec(rule(selector))?.[1] ?? 0);

describe("the phone sheet (nizam/50, 52; canvas rule 18)", () => {
  it("scrolls on its own: Base UI's Popup is a div, not a native dialog", () => {
    expect(rule("\\.mds-sheet")).toMatch(/overflow-y:\s*auto/);
  });

  it("lets a list opened from inside it sit above it", () => {
    expect(zIndex("\\.mds-popup-positioner")).toBeGreaterThan(
      zIndex("\\.mds-sheet")
    );
  });
});
