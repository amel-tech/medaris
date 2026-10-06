import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CourseResources } from "~/features/courses/components/course-resources";

// MDRS-279: a course's resources are links, and a link is an href on the
// page. Only an http(s) address becomes one, in a new tab with no opener and
// no referrer; a row without an address (the API's answer to a caller who
// may not read the content) is a name only.

type Resource = CourseDetailResponse["resources"][number];

const labels = {
  title: "Bu dersin kaynakları",
  newTab: " (yeni sekmede açılır)",
  locked: "Bağlantıları derse kayıtlı talebeler açar.",
};

const draw = (resources: Resource[] | undefined, locked = false) =>
  renderToStaticMarkup(
    createElement(CourseResources, { resources, labels, locked })
  );

const row = (over: Partial<Resource> = {}): Resource =>
  ({
    id: "r1",
    name: "Bina",
    meta: "PDF · 124 sayfa",
    type: "pdf",
    url: "https://files.medaris.org/bina.pdf",
    ...over,
  }) as Resource;

/** The anchors of the markup. */
const anchors = (html: string) => html.match(/<a [^>]*>/g) ?? [];

describe("CourseResources", () => {
  it("links an https and an http address in a new tab, with no opener and no referrer", () => {
    const html = draw([
      row(),
      row({ id: "r2", name: "Emsile", url: "http://emsile.test/" }),
    ]);
    expect(anchors(html)).toEqual([
      '<a class="mds-link" href="https://files.medaris.org/bina.pdf" target="_blank" rel="noopener noreferrer">',
      '<a class="mds-link" href="http://emsile.test/" target="_blank" rel="noopener noreferrer">',
    ]);
    expect(html).toContain(
      '<span class="mds-visually-hidden"> (yeni sekmede açılır)</span>'
    );
    expect(html).toContain("PDF · 124 sayfa");
    expect(html).toContain(">Bu dersin kaynakları<");
  });

  it("names a row without an address, and links nothing that is not http(s)", () => {
    const html = draw([
      row({ url: undefined }),
      row({ id: "r2", name: "Zararlı", url: "javascript:alert(1)" }),
      row({ id: "r3", name: "Göreli", url: "/bina.pdf" }),
      row({ id: "r4", name: "Veri", url: "data:text/html,x" }),
    ]);
    expect(anchors(html)).toEqual([]);
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text");
    for (const name of ["Bina", "Zararlı", "Göreli", "Veri"]) {
      expect(html).toContain(`>${name}<`);
    }
  });

  it("writes names and lines in their own direction", () => {
    const html = draw([row({ name: "البناء", meta: "PDF · ١٢٤ صفحة" })]);
    expect(html).toContain('<span class="mds-label" dir="auto">البناء</span>');
    expect(html).toContain('<span class="mds-caption" dir="auto">');
  });

  it("says who opens the links on a locked course", () => {
    expect(draw([row({ url: undefined })], true)).toContain(labels.locked);
    expect(draw([row()])).not.toContain(labels.locked);
  });

  it("draws nothing without a resource", () => {
    expect(draw([])).toBe("");
    expect(draw(undefined)).toBe("");
  });
});
