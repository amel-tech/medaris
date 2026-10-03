import { resources } from "@medaris/i18n";
import { describe, expect, it } from "vitest";
import {
  activeEntryId,
  currentKoskId,
  homeHref,
  isActive,
  navGroups,
  roleLabelKey,
  shellVariant,
  stripLocale,
  studentsPathAlias,
} from "~/lib/shell-nav";

const shell = resources.tr.nizam.Shell as {
  groups: Record<string, string>;
  items: Record<string, string>;
  roles: Record<string, string>;
};

/** What a menu reads like, group by group, in the viewer's words. */
const read = (variant: Parameters<typeof navGroups>[0]) =>
  navGroups(variant).map((g) => [
    shell.groups[g.id],
    ...g.items.map((i) => shell.items[i.label]),
  ]);

describe("which menu a person gets (nizam 50, 51, 52)", () => {
  it("is the başnazım's for SYSTEM_ADMIN, whatever else they hold", () => {
    expect(
      shellVariant({
        systemAdmin: true,
        assignments: [{ role: "KOSK_NAZIM" }],
      })
    ).toBe("chief");
  });

  it("is the Medaris nazımı's, and a köşk nazımı's only when they are not one", () => {
    expect(
      shellVariant({
        systemAdmin: false,
        assignments: [{ role: "KOSK_NAZIM" }, { role: "MEDARIS_NAZIM" }],
      })
    ).toBe("medaris");
    expect(
      shellVariant({
        systemAdmin: false,
        assignments: [{ role: "KOSK_NAZIM" }],
      })
    ).toBe("kosk");
  });

  it("is empty for the medrese's and the course's roles, for no role, and for a failed read", () => {
    expect(
      shellVariant({
        systemAdmin: false,
        assignments: [{ role: "MUDERRIS" }, { role: "MEDRESE_NAZIR" }],
      })
    ).toBe("none");
    expect(shellVariant({ systemAdmin: false, assignments: [] })).toBe("none");
    expect(shellVariant(null)).toBe("none");
    expect(navGroups("none")).toEqual([]);
  });
});

describe("the menus as the canvases draw them", () => {
  it("Medaris başnazımı (nizam/50)", () => {
    expect(read("chief")).toEqual([
      ["Genel", "Ana sayfa", "Bildirimler"],
      [
        "Platform",
        "Medreseler",
        "Köşkler",
        "Medaris nazımları",
        "İzin grupları",
        "Pasif kapsamlar",
      ],
      [
        "Talepler",
        "Köşk başvuruları",
        "Deste yayın istekleri",
        "İtirazlar",
        "Kalıcı yasak talepleri",
      ],
      ["Denetim", "Yasaklamalar", "Denetim kaydı", "Arşiv"],
      ["Ayarlar", "YouTube bağlantısı", "Platform ayarları"],
    ]);
  });

  it("Medaris nazımı (nizam/51): the başnazım's menu without what is the başnazım's alone", () => {
    expect(read("medaris")).toEqual([
      ["Genel", "Ana sayfa", "Bildirimler"],
      ["Platform", "Medreseler", "Köşkler"],
      [
        "Talepler",
        "Köşk başvuruları",
        "Deste yayın istekleri",
        "Kalıcı yasak talepleri",
      ],
      ["Denetim", "Yasaklamalar"],
    ]);
  });

  it("Köşk nazımı (nizam/52)", () => {
    expect(read("kosk")).toEqual([
      ["Genel", "Ana sayfa", "Bildirimler"],
      [
        "Köşk",
        "Dersler",
        "Celseler",
        "Talebeler",
        "Başvurular",
        "Ders talepleri",
        "Ders kayıtları",
        "Köşk desteleri",
        "Yasaklamalar",
        "Arşiv",
      ],
      ["Yönetim", "İzinler", "Köşk ayarları"],
    ]);
  });

  it("has no sign-out entry in any of them (canvas rule 18)", () => {
    for (const variant of ["chief", "medaris", "kosk"] as const) {
      for (const g of navGroups(variant)) {
        for (const i of g.items) {
          expect(`${i.path} ${shell.items[i.label]}`).not.toMatch(
            /çıkış|signout/i
          );
        }
      }
    }
  });

  it("badges only where a number has a source: the köşk's applications", () => {
    const badged = navGroups("kosk")
      .flatMap((g) => g.items)
      .filter((i) => i.countKey === "applications");
    expect(badged.map((i) => i.path)).toEqual(["/kosks/:kosk/basvurular"]);
  });
});

describe("the role line under the name", () => {
  it("is the widest role, else a medrese or course role, else Talebe (nizam/03)", () => {
    expect(
      shell.roles[roleLabelKey("chief", { systemAdmin: true, assignments: [] })]
    ).toBe("Medaris başnazımı");
    expect(
      shell.roles[
        roleLabelKey("none", {
          systemAdmin: false,
          assignments: [{ role: "DERS_NAZIR" }, { role: "MUDERRIS" }],
        })
      ]
    ).toBe("Müderris");
    expect(
      shell.roles[roleLabelKey("none", { systemAdmin: false, assignments: [] })]
    ).toBe("Talebe");
    expect(shell.roles[roleLabelKey("none", null)]).toBe("Talebe");
  });
});

describe("where the viewer is", () => {
  it("takes the köşk from the path when they manage it, else the first", () => {
    expect(currentKoskId("/kosks/b/basvurular", ["a", "b"])).toBe("b");
    expect(currentKoskId("/kosks/zzz/basvurular", ["a", "b"])).toBe("a");
    expect(currentKoskId("/", ["a", "b"])).toBe("a");
    expect(currentKoskId("/", [])).toBeNull();
  });

  it("strips the locale prefix only when it is one", () => {
    const locales = ["en", "tr", "ar"];
    expect(stripLocale("/tr/kosks/a", locales)).toBe("/kosks/a");
    expect(stripLocale("/tr", locales)).toBe("/");
    expect(stripLocale("/kosks/a", locales)).toBe("/kosks/a");
  });

  it("matches a section by whole segments, and `/` only itself", () => {
    expect(isActive("/", "/")).toBe(true);
    expect(isActive("/", "/kosks")).toBe(false);
    expect(isActive("/kosks/a", "/kosks/a/courses/c/edit")).toBe(true);
    expect(isActive("/kosks", "/kosks-other")).toBe(false);
  });

  it("marks the most specific entry: Dersler is the köşk's own path and would match every sibling", () => {
    const entries = [
      { id: "courses", path: "/kosks/a" },
      { id: "applications", path: "/kosks/a/basvurular" },
    ];
    expect(activeEntryId(entries, "/kosks/a/basvurular")).toBe("applications");
    expect(activeEntryId(entries, "/kosks/a/courses/c/edit")).toBe("courses");
    expect(activeEntryId(entries, "/unrelated")).toBeNull();
  });

  it("draws Talebeler selected on a course's roster (nizam/57)", () => {
    expect(studentsPathAlias("/kosks/a/courses/c/students")).toBe(
      "/kosks/a/talebeler"
    );
    expect(studentsPathAlias("/kosks/a/courses/c/edit")).toBe(
      "/kosks/a/courses/c/edit"
    );
  });

  it("keeps the logo on the locale root", () => {
    expect(homeHref).toBe("/");
  });
});
