import { BadRequestError } from "@medaris/common";

/**
 * A new row of a celse's resource list without a link (MDRS-286). A celse's
 * resource is a link or an uploaded file, and a file is added only through its
 * upload route (MDRS-287), so a row the list adds must carry `url`.
 */
export class ResourceUrlRequiredError extends BadRequestError {
  static readonly code = "RESOURCE_URL_REQUIRED";

  constructor() {
    super(
      ResourceUrlRequiredError.code,
      "A new resource of a session needs a url; files are added through the upload route"
    );
  }
}
