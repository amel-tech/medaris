export const headerNavLinks = [
  { key: "vision" as const, href: "#vision" },
  { key: "curriculum" as const, href: "#curriculum" },
  { key: "partnerships" as const, href: "#partnership" },
] as const;

/**
 * The header's two calls to action (MDRS-101): "Kayıt ol" opens tedris
 * registration, "Giriş yap" tedris sign-in. They pointed at the waitlist form,
 * which had no handler.
 */
export const headerCtaIntent = "register" as const;
export const headerSignInIntent = "signin" as const;
