// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerWithNotes } from "~/features/courses/components/player-with-notes";

/**
 * The layout the recordings tab and the session page share (MDRS-280): the
 * player first and at the full width of its column, the notes under it; side
 * by side only where the column itself is wide. The design system has one
 * viewport breakpoint (md:), so the width is asked of the column, as a
 * container query.
 */

const html = (notes: boolean) =>
  renderToStaticMarkup(
    createElement(PlayerWithNotes, {
      player: createElement("section", { id: "player" }),
      notes: notes ? createElement("section", { id: "notes" }) : null,
    })
  );

const host = (markup: string) => {
  const root = new DOMParser().parseFromString(markup, "text/html").body
    .firstElementChild as HTMLElement;
  const grid = root.firstElementChild as HTMLElement;
  return { root, grid, classes: (grid.getAttribute("class") ?? "").split(" ") };
};

describe("the player and its notes", () => {
  it("puts the player first and the notes after it, in one grid", () => {
    const { grid } = host(html(true));
    expect([...grid.children].map((c) => c.id)).toEqual(["player", "notes"]);
  });

  it("is one column unless the column itself is at least 64rem wide", () => {
    const { root, classes } = host(html(true));
    expect(root.getAttribute("class")).toBe("@container");
    expect(classes).toContain("grid-cols-1");
    expect(classes.filter((c) => c.includes("grid-cols-["))).toEqual([
      "@min-[64rem]:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]",
    ]);
    // no viewport breakpoint decides it: a phone is one column by default
    expect(classes.filter((c) => /^(max-)?(sm|md|lg|xl|2xl):/.test(c))).toEqual(
      []
    );
  });

  it("is the player alone when the viewer takes no notes", () => {
    const { grid } = host(html(false));
    expect([...grid.children].map((c) => c.id)).toEqual(["player"]);
  });
});
