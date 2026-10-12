import { FILE_TYPES, type IFileType } from "./file-type";

/** The longest stored name, extension included, in characters. */
export const MAX_FILE_NAME_LENGTH = 200;

/** What a file is called when its sent name has nothing left once cleaned. */
const FALLBACK_NAME = "dosya";

/**
 * Extensions a stored name may keep for each type; any other ends up with
 * the type's own appended. `.csv` is not text's: a spreadsheet would open it
 * and run a cell that starts with `=`.
 */
const EXTENSIONS: ReadonlyMap<IFileType, readonly string[]> = new Map<
  IFileType,
  readonly string[]
>([
  [FILE_TYPES.PDF, ["pdf"]],
  [FILE_TYPES.PNG, ["png"]],
  [FILE_TYPES.JPEG, ["jpg", "jpeg"]],
  [FILE_TYPES.WEBP, ["webp"]],
  [FILE_TYPES.DOCX, ["docx"]],
  [FILE_TYPES.XLSX, ["xlsx"]],
  [FILE_TYPES.PPTX, ["pptx"]],
  [FILE_TYPES.TEXT, ["txt", "md"]],
]);

/** Names Windows will not create a file under, whatever the extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * The name a file is stored and handed back under (MDRS-287): only ever a
 * label, shown in lists and put in the download's `Content-Disposition`,
 * never part of a storage key. From what the browser sent it keeps the last
 * path segment, drops control and invisible formatting characters
 * (right-to-left overrides that would make `fdp.exe` read as `exe.pdf`
 * included), replaces the characters Windows refuses and the quote, folds
 * whitespace, trims dots and spaces from both ends, and makes the extension
 * agree with the type read from the bytes: a PDF sent as `ödev.html` is
 * stored as `ödev.html.pdf`. At most `MAX_FILE_NAME_LENGTH` characters,
 * Unicode-normalised (NFC) so that a name typed on macOS compares equal to
 * the same name typed elsewhere.
 */
export function sanitizeFileName(
  sent: string | null | undefined,
  type: IFileType
): string {
  let name = (sent ?? "").normalize("NFC");
  name = name.split(/[\\/]/).pop() ?? "";
  name = name
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu, "")
    .replace(/[<>:"|?*]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^[.\s]+|[.\s]+$/g, "");

  const allowed = EXTENSIONS.get(type) ?? [type.extension];
  const dot = name.lastIndexOf(".");
  const sentExtension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  let base = name;
  let extension = type.extension;
  if (allowed.includes(sentExtension)) {
    base = name.slice(0, dot);
    extension = sentExtension;
  }
  base = base.replace(/[.\s]+$/g, "");
  if (!base || RESERVED.test(base.split(".")[0] ?? "")) {
    base = base ? `_${base}` : FALLBACK_NAME;
  }
  const room = MAX_FILE_NAME_LENGTH - extension.length - 1;
  const chars = Array.from(base);
  if (chars.length > room) base = chars.slice(0, room).join("").trimEnd();
  return `${base}.${extension}`;
}

/** RFC 5987's `attr-char` set: `encodeURIComponent` leaves `'()*` alone. */
const rfc5987 = (value: string): string =>
  encodeURIComponent(value).replace(
    /['()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );

/**
 * `Content-Disposition: attachment` for a stored name (RFC 6266): an ASCII
 * `filename` for old clients, accents dropped and anything else replaced, and
 * the exact name as `filename*`. Always an attachment, so a browser saves the
 * file instead of opening it in a Medaris origin.
 */
export function attachmentDisposition(name: string): string {
  const ascii =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7e]/g, "_")
      .replace(/["\\]/g, "_") || FALLBACK_NAME;
  return `attachment; filename="${ascii}"; filename*=UTF-8''${rfc5987(name)}`;
}
