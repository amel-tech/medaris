import { StreamableFile } from "@nestjs/common";
import type { Response } from "express";
import { attachmentDisposition } from "./file-name";
import type { ObjectStorage } from "./object-storage";

/** What a download needs to know of a stored file, read from its row. */
export interface IStoredFile {
  storageKey: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/**
 * The headers every download carries (MDRS-287): saved, never opened in the
 * page (`attachment`), never re-typed by the browser (`nosniff`), kept by no
 * cache, and refused every capability should a browser render it anyway.
 */
export const DOWNLOAD_HEADERS: Readonly<Record<string, string>> = {
  "X-Content-Type-Options": "nosniff",
  "Cache-Control": "private, no-store",
  "Content-Security-Policy": "default-src 'none'; sandbox",
};

/**
 * Streams a stored file to the caller. The type and the name are the ones
 * tedrisat recorded when it accepted the upload, never the store's. `missing`
 * builds the 404 for a row whose object the store no longer has.
 */
export async function streamStoredFile(
  storage: ObjectStorage,
  file: IStoredFile,
  response: Response,
  missing: () => Error
): Promise<StreamableFile> {
  storage.assertConfigured();
  const object = await storage.get(file.storageKey);
  if (!object) throw missing();
  response.set(DOWNLOAD_HEADERS);
  return new StreamableFile(object.body, {
    type: file.contentType,
    disposition: attachmentDisposition(file.fileName),
    length: object.size ?? file.sizeBytes,
  });
}
