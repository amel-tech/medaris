/**
 * Class names the theme's pages share (MDRS-100).
 *
 * These are the Login page's existing button and link styles, lifted out so
 * the pages added for MDRS-100 look like it instead of copying the string.
 * The pages themselves are placeholders until the launch designs (MDRS-127)
 * exist; when they do, this is where the shared look changes.
 */
export const primaryButtonClassName =
  "w-full bg-brand-primary text-white h-[48px] hover:bg-brand-primary/90 disabled:opacity-50 font-medium rounded-lg transition-all duration-200 shadow-sm hover:shadow-md";

export const secondaryButtonClassName =
  "w-full h-[48px] font-medium rounded-lg";

export const linkClassName = "text-brand-primary hover:underline font-medium";

export const fieldErrorClassName =
  "border border-error-secondary !text-error-primary placeholder:text-error-primary";

/**
 * Fields whose content is always Latin-script and left-to-right — e-mail
 * addresses, usernames and passwords. On an Arabic page (`<html dir="rtl">`)
 * they would otherwise inherit right-to-left, which puts the caret and the
 * text on the side the show-password button covers.
 */
const leftToRightFieldNames = new Set([
  "username",
  "email",
  "password",
  "password-new",
  "password-confirm",
]);

export function fieldDir(fieldName: string): "ltr" | undefined {
  return leftToRightFieldNames.has(fieldName) ? "ltr" : undefined;
}
