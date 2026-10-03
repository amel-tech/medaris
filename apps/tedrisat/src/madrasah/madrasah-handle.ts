import { MADRASAH_HANDLE_PATTERN } from "./dto/create-madrasah.dto";

const MAX_HANDLE = 60;
const FALLBACK_HANDLE = "medrese";

/** The Turkish letters Unicode decomposition leaves whole. */
const TURKISH: Record<string, string> = {
  ı: "i",
  İ: "i",
  ş: "s",
  Ş: "s",
  ğ: "g",
  Ğ: "g",
  ç: "c",
  Ç: "c",
  ö: "o",
  Ö: "o",
  ü: "u",
  Ü: "u",
};

/**
 * A handle made from a medrese's name (MDRS-170): "Atik Ali Paşa Medresesi" is
 * `atik-ali-pasa-medresesi`. Lower-case ASCII letters and digits, single
 * hyphens between words, 2–60 characters, always matching
 * `MADRASAH_HANDLE_PATTERN` — a name with no usable letter at all falls back to
 * `medrese`.
 */
export function handleFromName(name: string): string {
  const ascii = [...name]
    .map((ch) => TURKISH[ch] ?? ch)
    .join("")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  const slug = ascii
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_HANDLE)
    .replace(/-+$/g, "");
  return MADRASAH_HANDLE_PATTERN.test(slug) ? slug : FALLBACK_HANDLE;
}

/** `base`, then `base-2`, `base-3`… — the first one `taken` does not know, kept within 60 characters. */
export async function firstFreeHandle(
  base: string,
  taken: (handle: string) => Promise<boolean>
): Promise<string> {
  if (!(await taken(base))) return base;
  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`;
    const candidate = `${base.slice(0, MAX_HANDLE - suffix.length).replace(/-+$/g, "")}${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }
}
