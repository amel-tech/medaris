import { BOARD_ELEMENTS_MAX, BOARD_FILE_KEY } from "./dto/lesson-board.dto";
import { LessonBoardSceneInvalidError } from "./errors/lesson-board.errors";

/** A board's scene as it is kept: the canvas's elements and a reader's state. */
export interface IBoardScene {
  elements: Record<string, unknown>[];
  appState: Record<string, unknown>;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The only state a reader needs: the canvas's background. */
const KEPT_STATE = ["viewBackgroundColor"] as const;

/**
 * The scene the müderris's canvas sent, read from its JSON. tedrisat does not
 * draw a board and does not check a shape's geometry; it checks that this is a
 * scene at all (an `elements` list of objects, each with an id and a type),
 * that it is not unbounded, and that it carries no image bytes: an image is a
 * file of the board, named by its key, never a data URL inside the scene.
 * Everything but the elements and the background is dropped (the canvas sends
 * its whole editor state, the selection and the open menu included).
 */
export function readBoardScene(json: string): IBoardScene {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new LessonBoardSceneInvalidError("not JSON");
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.elements)) {
    throw new LessonBoardSceneInvalidError("no elements list");
  }
  if (parsed.elements.length > BOARD_ELEMENTS_MAX) {
    throw new LessonBoardSceneInvalidError(
      `more than ${BOARD_ELEMENTS_MAX} elements`
    );
  }
  const elements = parsed.elements.map((element) => {
    if (
      !isRecord(element) ||
      typeof element.id !== "string" ||
      typeof element.type !== "string"
    ) {
      throw new LessonBoardSceneInvalidError("an element has no id or type");
    }
    if (
      element.type === "image" &&
      element.fileId !== null &&
      !(
        typeof element.fileId === "string" &&
        BOARD_FILE_KEY.test(element.fileId)
      )
    ) {
      throw new LessonBoardSceneInvalidError("an image names no file");
    }
    return element;
  });
  if ("files" in parsed && parsed.files !== undefined) {
    throw new LessonBoardSceneInvalidError(
      "images are uploaded as files, not sent inside the scene"
    );
  }
  const state = isRecord(parsed.appState) ? parsed.appState : {};
  const appState: Record<string, unknown> = {};
  for (const key of KEPT_STATE) {
    if (typeof state[key] === "string") appState[key] = state[key];
  }
  return { elements, appState };
}

/** The keys of the files a scene still shows (a deleted image shows none). */
export function sceneFileKeys(scene: IBoardScene): string[] {
  const keys = new Set<string>();
  for (const element of scene.elements) {
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
