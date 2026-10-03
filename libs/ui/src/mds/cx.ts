/** Joins the truthy class names; the `.mds-*` layer is not Tailwind, so no merge step is needed. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
