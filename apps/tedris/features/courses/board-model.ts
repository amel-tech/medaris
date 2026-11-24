/**
 * A session's board (ders tahtası) as the talebe reads it: the scene the
 * müderris saved in nazar-web and the images on it. Pure: the canvas itself is
 * loaded only in the browser (`board-canvas.tsx`).
 */

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

/** Whether there is anything on the board to show. */
export const boardIsEmpty = (board: BoardFact): boolean =>
  board.elements.every(
    (element) => (element as { isDeleted?: boolean }).isDeleted === true
  );

/** The address of a board image on this app's own origin (the file proxy). */
export const boardFileHref = (lessonId: string, fileKey: string): string =>
  `/api/files/lessons/${lessonId}/board/files/${fileKey}`;
