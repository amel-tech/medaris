import { BadRequestError } from "@medaris/common";

/**
 * A resource list sent a `url` for a row that is a file in Medaris storage
 * (MDRS-287). A file keeps its file: to make it a link, remove the row and add
 * a link instead, which also removes the file from storage.
 */
export class ResourceIsFileError extends BadRequestError {
  static readonly code = "RESOURCE_IS_FILE";

  constructor(resourceId: string) {
    super(
      ResourceIsFileError.code,
      "This resource is a file: send it without a url, or remove it and add a link",
      { resourceId }
    );
  }
}
