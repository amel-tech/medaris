// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlayerWithNotes } from "~/features/courses/components/player-with-notes";

/**
 * The layout the recordings tab and the session page share (MDRS-280): the
 * player first, the notes under it, at every width; never side by side. The
 * block takes the width the page gives it and, on a short window, narrows
 * until a whole 16:9 frame fits under the top bar.
 */

const html = (notes: boolean) =>
  renderToStaticMarkup(
    createElement(PlayerWithNotes, {
      player: createElement("section", { id: "player" }),
      notes: notes ? createElement("section", { id: "notes" }) : null,
    })
  );

const block = (markup: string) =>
  new DOMParser().parseFromString(markup, "text/html").body
    .firstElementChild as HTMLElement;

describe("the player and its notes", () => {
  it("puts the player first and the notes under it", () => {
    const root = block(html(true));
    expect([...root.children].map((c) => c.id)).toEqual(["player", "notes"]);
    expect(root.className.split(" ")).toContain("flex-col");
  });

  it("is never two columns, at any width", () => {
    const classes = block(html(true)).className.split(" ");
    expect(classes.filter((c) => c.includes("grid-cols"))).toEqual([]);
    expect(
      classes.filter(
        (c) => c.startsWith("@") || /^(max-)?(sm|md|lg|xl|2xl):/.test(c)
      )
    ).toEqual([]);
  });

  it("narrows, centred, until a whole 16:9 frame fits under the top bar", () => {
    const classes = block(html(true)).className.split(" ");
    expect(classes).toContain("mx-auto");
    expect(classes).toContain(
      "max-inline-[min(100%,calc((100svh_-_var(--layout-topbar)_-_var(--space-12))*16/9))]"
    );
  });

  it("is the player alone when the viewer takes no notes", () => {
    expect([...block(html(false)).children].map((c) => c.id)).toEqual([
      "player",
    ]);
  });
});
