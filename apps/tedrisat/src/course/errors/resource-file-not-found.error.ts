import { NotFoundError } from "@medaris/common";

/**
 * No file to download (MDRS-287): no such resource on this course or celse,
 * one that is a link rather than a file, or a file the store no longer has.
 */
export class ResourceFileNotFoundError extends NotFoundError {
  static readonly code = "RESOURCE_FILE_NOT_FOUND";

  constructor(resourceId: string) {
    super(
      ResourceFileNotFoundError.code,
      `Resource ${resourceId} has no file here`,
      { resourceId }
    );
  }
}
