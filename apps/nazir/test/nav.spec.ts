import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  activeItemId,
  findSegment,
  labelNav,
  NAV,
  navFor,
  pageTitle,
  sectionSegments,
} from "~/features/shell/nav";

const medrese = {
  kind: "medrese" as const,
  id: "m-1",
  role: "MEDRESE_BASMUDERRIS",
};
const ders = { kind: "ders" as const, id: "c-1", role: "MUDERRIS" };

const view = (sections: ReturnType<typeof navFor>) =>
  sections.map((section) => [
    section.id,
    section.items.map((item) => [item.id, item.href]),
  ]);

describe("the menu of a medrese (nazir 21)", () => {
  const sections = navFor(medrese, { panoHref: "/medrese/m-1", counts: {} });

  it("has the sections and items of the canvas, in its order", () => {
    expect(view(sections)).toEqual([
      [
        "general",
        [
          ["pano", "/medrese/m-1"],
          ["notifications", "/bildirimler"],
        ],
      ],
      [
        "medrese",
        [
          ["courses", "/medrese/m-1/dersler"],
          ["students", "/medrese/m-1/talebeler"],
          ["nazirs", "/medrese/m-1/nazirlar"],
          ["bans", "/medrese/m-1/yasaklamalar"],
          ["appeals", "/medrese/m-1/itirazlar"],
          ["archive", "/medrese/m-1/arsiv"],
        ],
      ],
      [
        "management",
        [
          ["rules", "/medrese/m-1/kabul-kurallari"],
          ["settings", "/medrese/m-1/ayarlar"],
        ],
      ],
    ]);
  });

  it("has no item of a course", () => {
    const ids = sections.flatMap((s) => s.items.map((i) => i.id));
    expect(ids).not.toContain("overview");
    expect(ids).not.toContain("sessions");
  });

  it("badges Dersler with the courses holding an application and Bildirimler with the unread", () => {
    const counted = navFor(medrese, {
      panoHref: "/medrese/m-1",
      counts: { unread: 2, coursesWithApplications: 3, applications: 9 },
    });
    const items = counted.flatMap((s) => s.items);
    expect(items.find((i) => i.id === "courses")).toMatchObject({
      count: 3,
      countLabelKey: "countCoursesWithApplications",
    });
    expect(items.find((i) => i.id === "notifications")).toMatchObject({
      count: 2,
      countLabelKey: "countUnread",
    });
    // Talebeler has no number in a medrese, whatever else was read.
    expect(items.find((i) => i.id === "students")?.count).toBeUndefined();
  });
});

describe("the menu of a course (nazir 22)", () => {
  const sections = navFor(ders, { panoHref: "/medrese/m-1", counts: {} });

  it("has the sections and items of the canvas, in its order", () => {
    expect(view(sections)).toEqual([
      [
        "general",
        [
          ["pano", "/medrese/m-1"],
          ["notifications", "/bildirimler"],
        ],
      ],
      [
        "ders",
        [
          ["overview", "/ders/c-1"],
          ["curriculum", "/ders/c-1/mufredat"],
          ["sessions", "/ders/c-1/celseler"],
          ["students", "/ders/c-1/talebeler"],
          ["recordings", "/ders/c-1/kayitlar"],
          ["deck", "/ders/c-1/deste"],
          ["bans", "/ders/c-1/yasaklamalar"],
          ["archive", "/ders/c-1/arsiv"],
        ],
      ],
      [
        "management",
        [
          ["nazirs", "/ders/c-1/nazirlar"],
          ["settings", "/ders/c-1/ayarlar"],
        ],
      ],
    ]);
  });

  it("badges Celseler with the missing links and Talebeler with the waiting applications", () => {
    const items = navFor(ders, {
      panoHref: "/ders/c-1",
      counts: { unread: 3, missingLinks: 1, applications: 2 },
    }).flatMap((s) => s.items);
    expect(items.find((i) => i.id === "sessions")).toMatchObject({
      count: 1,
      countLabelKey: "countMissingLinks",
    });
    expect(items.find((i) => i.id === "students")).toMatchObject({
      count: 2,
      countLabelKey: "countApplications",
    });
    expect(items.find((i) => i.id === "notifications")?.count).toBe(3);
  });

  it("is a different menu from the medrese's whichever way the scope changes", () => {
    const m = navFor(medrese, { panoHref: "/medrese/m-1", counts: {} });
    expect(view(m)).not.toEqual(view(sections));
  });
});

describe("a menu down to what its holder may open (MDRS-223)", () => {
  const ids = (sections: ReturnType<typeof navFor>) =>
    sections.flatMap((section) => section.items.map((item) => item.id));

  it("gives the medrese's başmüderris every page of the medrese", () => {
    expect(
      ids(navFor(medrese, { panoHref: "/medrese/m-1", counts: {} }))
    ).toEqual([
      "pano",
      "notifications",
      "courses",
      "students",
      "nazirs",
      "bans",
      "appeals",
      "archive",
      "rules",
      "settings",
    ]);
  });

  it("leaves a medrese nazırı only Bildirimler, with the emptied sections and their headings gone", () => {
    const sections = navFor(
      { ...medrese, role: "MEDRESE_NAZIR" },
      { panoHref: "/medrese/m-1", counts: { coursesWithApplications: 2 } }
    );
    expect(view(sections)).toEqual([
      ["general", [["notifications", "/bildirimler"]]],
    ]);
  });

  it("gives a role the medrese does not know nothing of it either", () => {
    expect(
      ids(
        navFor(
          { ...medrese, role: "KOSK_NAZIM" },
          { panoHref: "/medrese/m-1", counts: {} }
        )
      )
    ).toEqual(["notifications"]);
  });

  it("leaves a course's menu whole for a müderris and a ders nazırı alike", () => {
    const whole = ids(navFor(ders, { panoHref: "/ders/c-1", counts: {} }));
    expect(whole).toHaveLength(12);
    expect(
      ids(
        navFor(
          { ...ders, role: "DERS_NAZIR" },
          { panoHref: "/ders/c-1", counts: {} }
        )
      )
    ).toEqual(whole);
  });
});

describe("a number that is missing or zero", () => {
  it("leaves the item without a badge", () => {
    const items = navFor(ders, {
      panoHref: "/ders/c-1",
      counts: { unread: 0, missingLinks: undefined, applications: -1 },
    }).flatMap((s) => s.items);
    for (const item of items) {
      expect(item.count, item.id).toBeUndefined();
      expect(item.countLabelKey, item.id).toBeUndefined();
    }
  });
});

describe("the item the viewer is on", () => {
  const sections = navFor(medrese, { panoHref: "/medrese/m-1", counts: {} });

  it("is the scope's own page for its address only", () => {
    expect(activeItemId(sections, "/medrese/m-1")).toBe("pano");
    expect(activeItemId(sections, "/medrese/m-1/dersler")).toBe("courses");
  });

  it("holds for a page below a section", () => {
    expect(activeItemId(sections, "/medrese/m-1/dersler/yeni")).toBe("courses");
    expect(activeItemId(sections, "/medrese/m-1/kabul-kurallari")).toBe(
      "rules"
    );
  });

  it("is Bildirimler on its page and nothing on the account page", () => {
    expect(activeItemId(sections, "/bildirimler")).toBe("notifications");
    expect(activeItemId(sections, "/hesap")).toBeNull();
  });

  it("does not take a longer name for a section", () => {
    expect(activeItemId(sections, "/medrese/m-1/derslerim")).toBeNull();
  });

  it("marks the course's own Genel bakış when Pano is the same page", () => {
    const alone = navFor(ders, { panoHref: "/ders/c-1", counts: {} });
    expect(activeItemId(alone, "/ders/c-1")).toBe("overview");
  });

  it("marks Pano of the medrese when it is elsewhere", () => {
    const withMedrese = navFor(ders, { panoHref: "/medrese/m-1", counts: {} });
    expect(activeItemId(withMedrese, "/ders/c-1")).toBe("overview");
    expect(activeItemId(withMedrese, "/ders/c-1/celseler")).toBe("sessions");
  });
});

describe("the pages behind the menu", () => {
  it("lists the segments the brief names, in menu order", () => {
    expect(sectionSegments("medrese")).toEqual([
      "dersler",
      "talebeler",
      "nazirlar",
      "yasaklamalar",
      "itirazlar",
      "arsiv",
      "kabul-kurallari",
      "ayarlar",
    ]);
    expect(sectionSegments("ders")).toEqual([
      "mufredat",
      "celseler",
      "talebeler",
      "kayitlar",
      "deste",
      "yasaklamalar",
      "arsiv",
      "nazirlar",
      "ayarlar",
    ]);
  });

  it("finds the entry of a segment under its own kind only", () => {
    expect(findSegment("medrese", "nazirlar")).toEqual({
      id: "nazirs",
      labelKey: "medrese.nazirs",
    });
    expect(findSegment("ders", "nazirlar")).toEqual({
      id: "nazirs",
      labelKey: "ders.nazirs",
    });
    expect(findSegment("ders", "dersler")).toBeNull();
    expect(findSegment("medrese", "mufredat")).toBeNull();
    expect(findSegment("medrese", "")).toBeNull();
    expect(findSegment("medrese", "Dersler")).toBeNull();
  });

  it("gives every segment a different address", () => {
    for (const kind of ["medrese", "ders"] as const) {
      const segments = sectionSegments(kind);
      expect(new Set(segments).size).toBe(segments.length);
    }
  });
});

describe("the labelled menu", () => {
  const nav = (key: string) => `nav:${key}`;
  const shell = (key: string) => `shell:${key}`;
  const labelled = labelNav(
    navFor(medrese, {
      panoHref: "/medrese/m-1",
      counts: { coursesWithApplications: 2 },
    }),
    { nav, shell }
  );

  it("carries the words of the keys and the number's label", () => {
    expect(labelled[1]).toMatchObject({
      id: "medrese",
      label: "nav:sections.medrese",
    });
    expect(labelled[1]?.items[0]).toMatchObject({
      label: "nav:medrese.courses",
      count: 2,
      countLabel: "shell:countCoursesWithApplications",
    });
    expect(labelled[0]?.items[0]?.countLabel).toBeUndefined();
  });

  it("names the page for the phone bar", () => {
    const outside = [{ path: "/hesap", title: "Hesap ve ayarlar" }];
    expect(pageTitle(labelled, "/medrese/m-1/dersler", outside, "Nazır")).toBe(
      "nav:medrese.courses"
    );
    expect(pageTitle(labelled, "/hesap", outside, "Nazır")).toBe(
      "Hesap ve ayarlar"
    );
    expect(pageTitle(labelled, "/baska", outside, "Nazır")).toBe("Nazır");
  });
});

describe("message keys of the menu", () => {
  const locales = ["tr", "en", "ar"] as const;
  const dig = (node: unknown, path: string) =>
    path
      .split(".")
      .reduce<unknown>(
        (n, part) => (n as Record<string, unknown> | undefined)?.[part],
        node
      );

  it("has a label for every item and section, and a word for every number, in every language", () => {
    for (const locale of locales) {
      const catalogue = resources[locale].nazir;
      for (const kind of ["medrese", "ders"] as const) {
        for (const section of navFor(
          {
            kind,
            id: "x",
            role: kind === "medrese" ? "MEDRESE_BASMUDERRIS" : "MUDERRIS",
          },
          {
            panoHref: "/x",
            // every number present, so every label key is produced
            counts: {
              unread: 1,
              coursesWithApplications: 1,
              missingLinks: 1,
              applications: 1,
            },
          }
        )) {
          expect(
            dig(catalogue.Nav, section.labelKey),
            `${locale} ${section.labelKey}`
          ).toEqual(expect.any(String));
          for (const item of section.items) {
            expect(
              dig(catalogue.Nav, item.labelKey),
              `${locale} ${item.labelKey}`
            ).toEqual(expect.any(String));
            if (item.countLabelKey) {
              expect(
                dig(catalogue.Shell, item.countLabelKey),
                `${locale} ${item.countLabelKey}`
              ).toEqual(expect.any(String));
            }
          }
        }
      }
    }
  });

  it("registers a count label for every number the menu can show", () => {
    const sources = new Set(
      Object.values(NAV).flatMap((sections) =>
        sections.flatMap((s) => s.entries.map((e) => e.count))
      )
    );
    sources.delete(undefined);
    expect([...sources].sort()).toEqual([
      "applications",
      "coursesWithApplications",
      "missingLinks",
      "unread",
    ]);
  });
});
