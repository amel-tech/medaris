"use client";

import "./board-canvas.css";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { type BoardFact, boardFileHref } from "../board-model";

export type BoardApi = ExcalidrawImperativeAPI;

/**
 * The canvas is a browser-only component (it measures and draws on mount), so
 * it is loaded on the client alone, behind the board's own "loading" line.
 */
const Excalidraw = dynamic(
  async () => (await import("@excalidraw/excalidraw")).Excalidraw,
  { ssr: false }
);

const LANG: Readonly<Record<string, string>> = {
  tr: "tr-TR",
  ar: "ar-SA",
  en: "en",
};

const asDataUrl = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

/**
 * A session's board on the canvas (Excalidraw, MIT): the scene tedrisat keeps,
 * and its images fetched one by one from this app's own origin and handed to
 * the canvas by the id each has in the scene. `readOnly` is the talebe's view
 * and a müderris's preview: nothing can be drawn or moved.
 *
 * The canvas lays itself out left to right whatever the page's direction; an
 * Arabic text box on it is still written and shown right to left.
 */
export function BoardCanvas({
  lessonId,
  board,
  readOnly,
  locale,
  labels,
  onReady,
  onChange,
}: {
  lessonId: string;
  board: BoardFact;
  readOnly: boolean;
  locale: string;
  labels: { canvas: string; loading: string; imagesFailed: string };
  /** The canvas's own API, once it has mounted. */
  onReady?: (api: BoardApi) => void;
  /** Something on the canvas changed (not the first draw). */
  onChange?: () => void;
}) {
  const [api, setApi] = useState<BoardApi | null>(null);
  const [imagesFailed, setImagesFailed] = useState(false);
  const drawn = useRef(false);

  // A saved board opens whole: `scrollToContent` in the initial data only
  // centres it, so a board wider than the view would open cut off.
  const hasContent = board.elements.length > 0;
  useEffect(() => {
    if (!api || !hasContent) return;
    const frame = requestAnimationFrame(() => {
      api.scrollToContent(undefined, { fitToContent: true, animate: false });
    });
    return () => cancelAnimationFrame(frame);
  }, [api, hasContent]);

  // The scene names its images; their bytes come after the canvas is up.
  useEffect(() => {
    if (!api || board.files.length === 0) return;
    let cancelled = false;
    void (async () => {
      const loaded = await Promise.all(
        board.files.map(async ({ fileKey, contentType }) => {
          try {
            const response = await fetch(boardFileHref(lessonId, fileKey), {
              credentials: "same-origin",
              cache: "no-store",
            });
            if (!response.ok) return null;
            return {
              id: fileKey,
              mimeType: contentType,
              dataURL: await asDataUrl(await response.blob()),
              created: Date.now(),
            };
          } catch {
            return null;
          }
        })
      );
      if (cancelled) return;
      const files = loaded.filter((file) => file !== null);
      if (files.length < loaded.length) setImagesFailed(true);
      api.addFiles(files as unknown as Parameters<BoardApi["addFiles"]>[0]);
    })();
    return () => {
      cancelled = true;
    };
  }, [api, board.files, lessonId]);

  return (
    <div className="flex flex-col gap-2">
      {imagesFailed ? (
        <p className="mds-body-sm" role="alert">
          {labels.imagesFailed}
        </p>
      ) : null}
      {/* biome-ignore lint/a11y/useSemanticElements: a drawing surface, named for a screen reader; the canvas inside it is the component's own */}
      <div
        role="group"
        aria-label={labels.canvas}
        dir="ltr"
        className="relative block-[70vh] min-block-[28rem] overflow-hidden rounded-surface border border-neutral-subtle"
      >
        {api ? null : (
          <output className="mds-caption absolute p-4">{labels.loading}</output>
        )}
        <Excalidraw
          initialData={{
            elements: board.elements as never,
            appState: board.background
              ? { viewBackgroundColor: board.background }
              : undefined,
            scrollToContent: true,
          }}
          excalidrawAPI={(ready) => {
            setApi(ready);
            onReady?.(ready);
          }}
          onChange={() => {
            // The canvas reports its first draw as a change.
            if (drawn.current) onChange?.();
            drawn.current = true;
          }}
          viewModeEnabled={readOnly}
          zenModeEnabled={readOnly}
          langCode={LANG[locale] ?? "en"}
          UIOptions={{
            canvasActions: {
              loadScene: false,
              saveToActiveFile: false,
              export: false,
              saveAsImage: true,
              toggleTheme: false,
              changeViewBackgroundColor: !readOnly,
              clearCanvas: !readOnly,
            },
          }}
        />
      </div>
    </div>
  );
}
