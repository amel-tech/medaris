import type { CourseDetailResponse } from "@medaris/services/tedrisat";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  CourseResources,
  ResourceList,
} from "~/features/courses/components/course-resources";

// MDRS-279: a course's resources are links, and a link is an href on the
// page. Only an http(s) address becomes one, in a new tab with no opener and
// no referrer; a row without an address (the API's answer to a caller who
// may not read the content) is a name only.

type Resource = CourseDetailResponse["resources"][number];

const labels = {
  title: "Bu dersin kaynakları",
  newTab: " (yeni sekmede açılır)",
  download: " (indirilir)",
  locked: "Kaynakları derse kayıtlı talebeler açar.",
};

const draw = (resources: Resource[] | undefined, locked = false) =>
  renderToStaticMarkup(
    createElement(CourseResources, { resources, labels, locale: "tr", locked })
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

// MDRS-286: a link on Google Drive reads as such, with the platform chip's
// look for a provider (its name alone, no dot), under the row's name.
describe("CourseResources, the provider of a link", () => {
  const DRIVE_CHIP =
    '<span class="mds-platform-chip mds-platform-chip--google-drive self-start mbs-1">Google Drive</span>';

  it("labels a Google Drive link, and only that row", () => {
    const html = draw([
      row({
        id: "r1",
        name: "Bina şerhi",
        url: "https://drive.google.com/file/d/1a2b3c/view",
      }),
      row({ id: "r2", name: "Emsile", url: "https://files.medaris.org/e.pdf" }),
    ]);
    expect(html.split(DRIVE_CHIP)).toHaveLength(2);
    expect(html.indexOf(DRIVE_CHIP)).toBeGreaterThan(
      html.indexOf(">Bina şerhi<")
    );
    expect(html.indexOf(DRIVE_CHIP)).toBeLessThan(html.indexOf(">Emsile<"));
    expect(html).not.toContain("mds-platform-chip__dot");
  });

  it("labels nothing it does not link: no address, or one that is not http(s)", () => {
    const html = draw(
      [
        row({ url: undefined }),
        row({
          id: "r2",
          name: "Zararlı",
          url: "javascript://drive.google.com/%0aalert(1)",
        }),
      ],
      true
    );
    expect(html).not.toContain("mds-platform-chip");
    expect(html).not.toContain("Google Drive");
  });

  it("takes a celse's row, which has no type and may send a null line, as a bare list the detail page names (MDRS-289)", () => {
    const html = renderToStaticMarkup(
      createElement(ResourceList, {
        resources: [
          {
            id: "lr1",
            name: "Celse notu",
            meta: null,
            url: "https://docs.google.com/document/d/1a2b3c/edit",
          },
        ],
        labels,
        locale: "tr",
        testId: "session-resources",
      })
    );
    expect(
      html.startsWith(
        '<ul class="m-0 flex list-none flex-col p-0" data-testid="session-resources">'
      )
    ).toBe(true);
    expect(html).toContain(">Celse notu<");
    expect(html).toContain(DRIVE_CHIP);
    expect(html).not.toContain('class="mds-caption"');
    expect(html).not.toContain("mds-card");
  });

  it("keeps the course's own test id on its card", () => {
    const html = draw([row()]);
    expect(html.match(/data-testid="[^"]*"/g)).toEqual([
      'data-testid="course-resources"',
    ]);
  });
});

// MDRS-287: a resource may be a file in Medaris storage. Its address is this
// app's download route, which adds the token on the server and hands back an
// attachment; the row says its type and size. Like a link's address, the
// file comes only to who may read the content: a locked row is a name.
describe("CourseResources, a file", () => {
  const COURSE = "0b7f6c1e-2a4d-4c8e-9f10-3a5b6c7d8e9f";
  const LESSON = "11111111-1111-4111-8111-111111111111";
  const R1 = "5d2e8f40-1c3b-4a6d-8e7f-90a1b2c3d4e5";
  const fileRow = (over: Partial<Resource> = {}): Resource =>
    row({
      id: R1,
      name: "Bina şerhi",
      meta: undefined,
      type: undefined,
      url: undefined,
      file: {
        name: "bina-serhi.pdf",
        contentType: "application/pdf",
        sizeBytes: 2.5 * 1024 * 1024,
        downloadUrl: `/courses/${COURSE}/resources/${R1}/file`,
      },
      ...over,
    });

  it("downloads through this app's route, not in a new tab, with its type and size under its name", () => {
    const html = draw([fileRow()]);
    expect(anchors(html)).toEqual([
      `<a class="mds-link" href="/api/files/courses/${COURSE}/resources/${R1}">`,
    ]);
    expect(html).toContain(
      '<span class="mds-visually-hidden"> (indirilir)</span>'
    );
    expect(html).not.toContain("target=");
    expect(html).not.toContain("yeni sekmede");
    expect(html).toContain(
      '<span class="mds-badge mds-badge--secondary">PDF</span>'
    );
    expect(html).toContain("2,5 MB");
    expect(html).not.toContain(labels.locked);
  });

  it("downloads a celse's file through the celse's route", () => {
    const html = renderToStaticMarkup(
      createElement(ResourceList, {
        resources: [
          {
            id: R1,
            name: "Çekim tablosu",
            meta: null,
            url: null,
            file: {
              name: "tablo.xlsx",
              contentType:
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              sizeBytes: 18 * 1024,
              downloadUrl: `/lessons/${LESSON}/resources/${R1}/file`,
            },
          },
        ],
        labels,
        locale: "tr",
      })
    );
    expect(anchors(html)).toEqual([
      `<a class="mds-link" href="/api/files/lessons/${LESSON}/resources/${R1}">`,
    ]);
    expect(html).toContain(">XLSX<");
    expect(html).toContain("18 kB");
  });

  it("names a file without a link, a chip or a size to who may not read the content", () => {
    const html = draw([fileRow({ file: undefined })], true);
    expect(html).toContain(">Bina şerhi<");
    expect(anchors(html)).toEqual([]);
    expect(html).not.toContain("mds-badge");
    expect(html).not.toContain("/api/files");
    expect(html).toContain(labels.locked);
  });

  it("links no file whose route is not tedrisat's download route", () => {
    const html = draw([
      fileRow({
        file: {
          name: "x.pdf",
          contentType: "application/pdf",
          sizeBytes: 10,
          downloadUrl: "https://storage.bunnycdn.com/medaris/x.pdf",
        },
      }),
    ]);
    expect(anchors(html)).toEqual([]);
    expect(html).not.toContain("bunnycdn");
    expect(html).toContain(">Bina şerhi<");
  });
});
