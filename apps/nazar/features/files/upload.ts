import { handleUnauthenticated } from "~/lib/unauthenticated";

/**
 * Sends one file to one of this app's upload routes (`fileRoutes`) and reads
 * the answer (MDRS-287). The body is `multipart/form-data` with the file as
 * `file` and, when given, the row's `name` and `meta`; the route streams it
 * on to tedrisat, which answers 201 with its JSON.
 *
 * A 401 is the session being over: the route's `{ kind: "unauthenticated" }`
 * goes to `handleUnauthenticated`, which sends the person to sign in and back
 * to this page, and the caller draws nothing else (`signedOut`). Every other
 * refusal is its code, which the page words (`fileErrorKey`); an answer
 * without one (a body cut off by something in front of the app) is read from
 * its status, and a request that never got an answer is `NETWORK`.
 */
export type UploadOutcome<T> =
  | { status: "ok"; data: T }
  | { status: "failed"; code: string }
  | { status: "signedOut" };

export interface UploadFields {
  file: File;
  /** the row's name; tedrisat takes the file's own name when it is empty */
  name?: string;
  /** the row's short line */
  meta?: string;
}

const STATUS_CODES: Readonly<Record<number, string>> = {
  400: "FILE_REQUIRED",
  403: "AUTHZ_FORBIDDEN",
  413: "FILE_TOO_LARGE",
  415: "FILE_TYPE_NOT_ALLOWED",
  503: "STORAGE_UNAVAILABLE",
};

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const codeOf = (body: unknown, status: number): string => {
  const code =
    body !== null && typeof body === "object" && "code" in body
      ? (body as { code: unknown }).code
      : undefined;
  if (typeof code === "string" && code) return code;
  return STATUS_CODES[status] ?? `HTTP_${status}`;
};

export async function uploadFile<T>(
  route: string,
  fields: UploadFields
): Promise<UploadOutcome<T>> {
  const body = new FormData();
  const name = fields.name?.trim();
  const meta = fields.meta?.trim();
  if (name) body.append("name", name);
  if (meta) body.append("meta", meta);
  // The short fields first, then the file, as a form posts them.
  body.append("file", fields.file, fields.file.name);

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
    return { status: "failed", code: "NETWORK" };
  }
  const json = await readJson(response);
  if (response.status === 401) {
    handleUnauthenticated(
      json !== null && typeof json === "object" && "kind" in json
        ? json
        : { kind: "unauthenticated" }
    );
    return { status: "signedOut" };
  }
  if (!response.ok) {
    return { status: "failed", code: codeOf(json, response.status) };
  }
  return json === null
    ? { status: "failed", code: `HTTP_${response.status}` }
    : { status: "ok", data: json as T };
}
