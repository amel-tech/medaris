import { cekim, readSarf } from "@medaris/sarf";
import { describe, expect, it } from "vitest";
import {
  boardFact,
  boardFileHref,
  sarfTableTexts,
  sceneToSave,
  shownFileKeys,
} from "~/features/board/board";

describe("boardFact", () => {
  it("reads the scene tedrisat keeps", () => {
    const fact = boardFact({
      scene: {
        elements: [{ id: "a", type: "rectangle" }, "junk"],
        appState: { viewBackgroundColor: "#fff" },
      },
      files: [{ fileKey: "k", contentType: "image/png" }],
    });
    expect(fact).toEqual({
      elements: [{ id: "a", type: "rectangle" }],
      background: "#fff",
      files: [{ fileKey: "k", contentType: "image/png" }],
    });
  });

  it("reads a session with no board, or a scene it cannot read, as empty", () => {
    const empty = { elements: [], background: null, files: [] };
    expect(boardFact({ scene: null, files: [] })).toEqual(empty);
    expect(boardFact({ scene: { elements: "x" }, files: [] })).toEqual(empty);
  });
});

describe("what is sent on save", () => {
  const elements = [
    { id: "a", type: "image", fileId: "kept" },
    { id: "b", type: "image", fileId: "gone", isDeleted: true },
    { id: "c", type: "image", fileId: "kept" },
    { id: "d", type: "text" },
  ];

  it("leaves the canvas's deleted elements out of the scene", () => {
    const scene = JSON.parse(sceneToSave(elements, "#fffdf7"));
    expect(scene.elements.map((e: { id: string }) => e.id)).toEqual([
      "a",
      "c",
      "d",
    ]);
    expect(scene.appState).toEqual({ viewBackgroundColor: "#fffdf7" });
    // The images' bytes are files of the board, never part of the scene.
    expect("files" in scene).toBe(false);
  });

  it("names each image the canvas still shows once", () => {
    expect(shownFileKeys(elements)).toEqual(["kept"]);
  });

  it("addresses an image on this app's own origin", () => {
    expect(boardFileHref("L", "k")).toBe("/api/files/lessons/L/board/files/k");
  });
});

describe("sarfTableTexts", () => {
  const sarf = readSarf({
    root: "ن ص ر",
    bab: "nasara",
    mastar: "yardım etmek",
  });
  if (!sarf) throw new Error("no sarf");
  const labels = {
    title: "T",
    row: (row: string) => `row:${row}`,
    column: (column: string) => `col:${column}`,
  };

  it("lays a fiil's fourteen sîgas under their numbers, each with its meaning", () => {
    const table = cekim(sarf, "mazi");
    if (!table) throw new Error("no table");
    const texts = sarfTableTexts(table, labels, { x: 100, y: 200 });
    const words = texts.map((text) => text.text);
    expect(words[0]).toBe("T");
    expect(words.slice(1, 4)).toEqual(["col:mufred", "col:tesniye", "col:cem"]);
    expect(words.filter((word) => word.startsWith("row:"))).toEqual([
      "row:gaib",
      "row:gaibe",
      "row:muhatab",
      "row:muhataba",
      "row:mutekellim",
    ]);
    // 1 title + 3 numbers + 5 persons + 14 sîgas + 14 meanings.
    expect(texts).toHaveLength(37);
    expect(words).toContain("Ben yardım ettim");
    // Everything is to the right of and below where it was put.
    expect(texts.every((text) => text.x >= 100 && text.y >= 200)).toBe(true);
    // The three numbers of one person share a line.
    const gaib = texts.filter((text) => text.fontSize === 28).slice(1, 4);
    expect(new Set(gaib.map((text) => text.y)).size).toBe(1);
    expect(new Set(gaib.map((text) => text.x)).size).toBe(3);
  });

  it("lays only the rows the kip has", () => {
    const table = cekim(sarf, "emri_hazir");
    if (!table) throw new Error("no table");
    const words = sarfTableTexts(table, labels, { x: 0, y: 0 }).map(
      (text) => text.text
    );
    expect(words.filter((word) => word.startsWith("row:"))).toEqual([
      "row:muhatab",
      "row:muhataba",
    ]);
  });

  it("leaves the meanings out when the root has no mastar", () => {
    const bare = readSarf({ root: "ن ص ر", bab: "nasara" });
    const table = bare ? cekim(bare, "ismi_fail") : null;
    if (!table) throw new Error("no table");
    // 1 title + 3 numbers + 2 genders + 6 sîgas.
    expect(sarfTableTexts(table, labels, { x: 0, y: 0 })).toHaveLength(12);
  });
});
