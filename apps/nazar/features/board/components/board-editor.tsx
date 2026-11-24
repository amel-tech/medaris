"use client";

import {
  BINAS,
  type Bina,
  cekim,
  hasMechul,
  readSarf,
  SIGA_KIPS,
  type SigaKip,
} from "@medaris/sarf";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Field } from "@medaris/ui/mds/field";
import { Select } from "@medaris/ui/mds/select";
import { useToaster } from "@medaris/ui/mds/toast";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { handleUnauthenticated } from "~/lib/unauthenticated";
import type { SarfRootFact } from "../../sarf/sarf";
import {
  type BoardFact,
  sarfTableTexts,
  sceneToSave,
  shownFileKeys,
} from "../board";
import { type BoardApi, BoardCanvas } from "./board-canvas";

/** What tedrisat's refusal of a board write reads as, by its code. */
const failureKey = (code: string): string => {
  if (code === "FILE_TOO_LARGE") return "Board.tooLarge";
  if (code === "FILE_TYPE_NOT_ALLOWED") return "Board.typeNotAllowed";
  if (code === "LESSON_BOARD_FILES_FULL") return "Board.filesFull";
  if (code === "STORAGE_NOT_CONFIGURED" || code === "STORAGE_UNAVAILABLE")
    return "Board.storageUnavailable";
  return "Board.failed";
};

/** One multipart POST to this app's file proxy; null is success, else a code. */
async function send(route: string, body: FormData): Promise<string | null> {
  let response: Response;
  try {
    response = await fetch(route, {
      method: "POST",
      body,
      headers: { Accept: "application/json" },
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    return "NETWORK";
  }
  if (response.ok) return null;
  const json: unknown = await response.json().catch(() => null);
  if (response.status === 401) {
    handleUnauthenticated(
      json !== null && typeof json === "object" && "kind" in json
        ? json
        : { kind: "unauthenticated" }
    );
    return "SIGNED_OUT";
  }
  const code =
    json !== null && typeof json === "object" && "code" in json
      ? (json as { code: unknown }).code
      : null;
  if (typeof code === "string" && code) return code;
  return response.status === 413 ? "FILE_TOO_LARGE" : `HTTP_${response.status}`;
}

/**
 * The müderris's board of one session: the canvas, "Tahtayı kaydet", and a
 * sarf table from the engine laid onto it as text. A picture is pasted or
 * picked on the canvas itself; saving uploads each new one as a file of the
 * board, then the scene that shows them.
 */
export function BoardEditor({
  lessonId,
  board,
  roots,
}: {
  lessonId: string;
  board: BoardFact;
  /** The roots on the course's sarf page, to lay a table of. */
  roots: SarfRootFact[];
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const sarfWords = useTranslations("common.sarf");
  const locale = useLocale();
  const { notify } = useToaster();
  const api = useRef<BoardApi | null>(null);
  // The images tedrisat already holds: only a new one is uploaded.
  const stored = useRef(new Set(board.files.map((file) => file.fileKey)));
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string | null>(roots[0]?.id ?? null);
  const [kip, setKip] = useState<SigaKip>("mazi");
  const [bina, setBina] = useState<Bina>("malum");

  // Leaving with unsaved marks asks first, as any editor does.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const save = async () => {
    const canvas = api.current;
    if (!canvas || saving) return;
    setSaving(true);
    setFailure(null);
    try {
      const elements = canvas.getSceneElements();
      const files = canvas.getFiles();
      for (const fileKey of shownFileKeys(elements)) {
        if (stored.current.has(fileKey)) continue;
        const file = files[fileKey];
        if (!file) continue;
        const blob = await (await fetch(file.dataURL)).blob();
        const body = new FormData();
        body.append("fileKey", fileKey);
        body.append("file", blob, "tahta-gorseli");
        const refused = await send(
          `/api/files/lessons/${lessonId}/board/files`,
          body
        );
        if (refused === "SIGNED_OUT") return;
        if (refused) {
          setFailure(words(failureKey(refused)));
          return;
        }
        stored.current.add(fileKey);
      }
      const body = new FormData();
      body.append(
        "file",
        new Blob(
          [sceneToSave(elements, canvas.getAppState().viewBackgroundColor)],
          { type: "application/json" }
        ),
        "scene.json"
      );
      const refused = await send(`/api/files/lessons/${lessonId}/board`, body);
      if (refused === "SIGNED_OUT") return;
      if (refused) {
        setFailure(words(failureKey(refused)));
        return;
      }
      setDirty(false);
      notify({ tone: "success", title: words("Board.saved") });
    } finally {
      setSaving(false);
    }
  };

  const root = roots.find((candidate) => candidate.id === rootId) ?? null;

  const addTable = async () => {
    const canvas = api.current;
    if (!canvas || !root) return;
    const sarf = readSarf({
      root: root.kok,
      bab: root.bab,
      mastar: root.mastar ?? undefined,
      masdar: root.masdarVezin,
    });
    const table = sarf
      ? cekim(sarf, kip, hasMechul(kip) ? bina : "malum")
      : null;
    if (!table) return;
    const state = canvas.getAppState();
    const zoom = state.zoom.value || 1;
    const texts = sarfTableTexts(
      table,
      {
        title: `${root.kok} · ${sarfWords(`kip.${kip}`)}${
          hasMechul(kip) ? ` · ${sarfWords(`bina.${table.bina}`)}` : ""
        }`,
        row: (row) => sarfWords(`row.${row}`),
        column: (column) => sarfWords(`sayi.${column}`),
      },
      // Where the müderris is looking: the top left of what is on screen.
      { x: -state.scrollX + 80 / zoom, y: -state.scrollY + 80 / zoom }
    );
    const { convertToExcalidrawElements } = await import(
      "@excalidraw/excalidraw"
    );
    canvas.updateScene({
      elements: [
        ...canvas.getSceneElements(),
        ...convertToExcalidrawElements(texts),
      ],
    });
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="mds-body-sm text-neutral-muted">{words("Board.hint")}</p>
        <div className="flex items-center gap-3">
          {dirty ? (
            <output className="mds-caption">{words("Board.unsaved")}</output>
          ) : null}
          <Button loading={saving} onClick={() => void save()}>
            {words("Board.save")}
          </Button>
        </div>
      </div>
      {failure ? <Alert tone="error">{failure}</Alert> : null}
      <BoardCanvas
        lessonId={lessonId}
        board={board}
        readOnly={false}
        locale={locale}
        labels={{
          canvas: words("Board.canvas"),
          loading: words("Board.loading"),
          imagesFailed: words("Board.imagesFailed"),
        }}
        onReady={(ready) => {
          api.current = ready;
        }}
        onChange={() => setDirty(true)}
      />
      <section className="flex flex-col gap-3">
        <h2 className="mds-h3">{words("Board.sarfTitle")}</h2>
        {roots.length === 0 ? (
          <p className="mds-body-sm text-neutral-muted">
            {words("Board.sarfNoRoots")}
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <Field label={words("Board.sarfRoot")}>
              <Select
                value={rootId}
                onChange={setRootId}
                options={roots.map((candidate) => ({
                  value: candidate.id,
                  label: candidate.kok,
                }))}
              />
            </Field>
            <Field label={words("Board.sarfKip")}>
              <Select
                value={kip}
                onChange={(value) => {
                  const next = SIGA_KIPS.find((k) => k === value);
                  if (next) setKip(next);
                }}
                options={SIGA_KIPS.map((k) => ({
                  value: k,
                  label: sarfWords(`kip.${k}`),
                }))}
              />
            </Field>
            {hasMechul(kip) ? (
              <Field label={words("Board.sarfBina")}>
                <Select
                  value={bina}
                  onChange={(value) => {
                    const next = BINAS.find((b) => b === value);
                    if (next) setBina(next);
                  }}
                  options={BINAS.map((b) => ({
                    value: b,
                    label: sarfWords(`bina.${b}`),
                  }))}
                />
              </Field>
            ) : null}
            <Button variant="secondary" onClick={() => void addTable()}>
              {words("Board.sarfAdd")}
            </Button>
          </div>
        )}
      </section>
    </div>
  );
}
