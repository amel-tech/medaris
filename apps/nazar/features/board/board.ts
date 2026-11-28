/**
 * A session's board (ders tahtası): what is kept of the canvas, and how a
 * sarf table is laid onto it. Pure: the canvas component itself is loaded only
 * in the browser (`board-canvas.tsx`).
 */

import {
  type CekimTablosu,
  type Hucre,
  SIGA_COLUMNS,
  type SigaRow,
  sigaRows,
  slotRow,
} from "@medaris/sarf";

/** The board as tedrisat keeps it (`GET /lessons/:id/board`). */
export interface BoardFact {
  /** The canvas's elements; empty for a session with no board yet. */
  elements: readonly object[];
  background: string | null;
  /** The images on the board, by the id the canvas gave each. */
  files: readonly { fileKey: string; contentType: string }[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The API's answer as the canvas needs it; a scene it cannot read is an empty board. */
export function boardFact(response: {
  scene: object | null;
  files: readonly { fileKey: string; contentType: string }[];
}): BoardFact {
  const scene = isRecord(response.scene) ? response.scene : {};
  const elements = Array.isArray(scene.elements)
    ? scene.elements.filter(isRecord)
    : [];
  const state = isRecord(scene.appState) ? scene.appState : {};
  return {
    elements,
    background:
      typeof state.viewBackgroundColor === "string"
        ? state.viewBackgroundColor
        : null,
    files: response.files.map(({ fileKey, contentType }) => ({
      fileKey,
      contentType,
    })),
  };
}

/** The address of a board image on this app's own origin (the file proxy). */
export const boardFileHref = (lessonId: string, fileKey: string): string =>
  `/api/files/lessons/${lessonId}/board/files/${fileKey}`;

/**
 * The scene as it is sent: the elements still on the canvas and its
 * background. A deleted element is the canvas's own undo history and is left
 * out, and with it the image only it showed. The images' bytes never go in
 * the scene: each is uploaded as a file of the board first.
 */
export function sceneToSave(
  elements: readonly { isDeleted?: boolean }[],
  background: string | undefined
): string {
  return JSON.stringify({
    elements: elements.filter((element) => element.isDeleted !== true),
    appState: background ? { viewBackgroundColor: background } : {},
  });
}

/** The ids of the images the canvas still shows. */
export function shownFileKeys(
  elements: readonly { type?: string; isDeleted?: boolean; fileId?: unknown }[]
): string[] {
  const keys = new Set<string>();
  for (const element of elements) {
    if (
      element.type === "image" &&
      element.isDeleted !== true &&
      typeof element.fileId === "string"
    ) {
      keys.add(element.fileId);
    }
  }
  return [...keys];
}

// ---- a sarf table on the board ------------------------------------------------

/** A piece of text to put on the canvas, in the canvas's own units. */
export interface BoardText {
  type: "text";
  x: number;
  y: number;
  text: string;
  fontSize: number;
}

const COLUMN = 240;
const ROW = 96;
const SIDE = 150;
const HEAD = 56;

/**
 * One çekim table as text for the canvas: its title, the numbers across, the
 * persons down the side and each sîga in its cell with its meaning under it.
 * Plain text elements, so the müderris moves, marks and edits them like
 * anything else on the board.
 */
export function sarfTableTexts(
  table: CekimTablosu,
  labels: {
    title: string;
    row: (row: SigaRow) => string;
    column: (column: (typeof SIGA_COLUMNS)[number]) => string;
  },
  origin: { x: number; y: number }
): BoardText[] {
  const texts: BoardText[] = [
    {
      type: "text",
      x: origin.x,
      y: origin.y,
      text: labels.title,
      fontSize: 28,
    },
  ];
  SIGA_COLUMNS.forEach((column, c) => {
    texts.push({
      type: "text",
      x: origin.x + SIDE + c * COLUMN,
      y: origin.y + HEAD,
      text: labels.column(column),
      fontSize: 16,
    });
  });
  const rows = sigaRows(table.kip);
  const rowOf = (hucre: Hucre): SigaRow =>
    hucre.sahis === null
      ? (hucre.cinsiyet ?? "muzekker")
      : slotRow({
          sahis: hucre.sahis,
          cinsiyet: hucre.cinsiyet,
          sayi: hucre.sayi,
        });
  rows.forEach((row, r) => {
    const y = origin.y + HEAD + 40 + r * ROW;
    texts.push({
      type: "text",
      x: origin.x,
      y: y + 8,
      text: labels.row(row),
      fontSize: 16,
    });
    for (const hucre of table.hucreler) {
      if (!hucre || rowOf(hucre) !== row) continue;
      const x = origin.x + SIDE + SIGA_COLUMNS.indexOf(hucre.sayi) * COLUMN;
      texts.push({ type: "text", x, y, text: hucre.arabic, fontSize: 28 });
      if (hucre.anlam) {
        texts.push({
          type: "text",
          x,
          y: y + 46,
          text: hucre.anlam,
          fontSize: 14,
        });
      }
    }
  });
  return texts;
}

/**
 * The canvas's elements with the sizes of `measured` taken over, by id: where
 * each stands, and everything else about it, is the müderris's and is kept.
 * An element whose size already agrees is handed back as it is.
 */
export function resized<
  T extends { id: string; width: number; height: number },
>(
  elements: readonly T[],
  measured: readonly { id: string; width: number; height: number }[]
): T[] {
  const sizes = new Map(measured.map((element) => [element.id, element]));
  return elements.map((element) => {
    const size = sizes.get(element.id);
    if (!size) return element;
    if (size.width === element.width && size.height === element.height) {
      return element;
    }
    return { ...element, width: size.width, height: size.height };
  });
}
