import { getTranslations } from "next-intl/server";

/**
 * A translator that takes a key built at run time. Role names, permission
 * codes, menu items and badge states come from the API or from data, so their
 * keys cannot be literals (`next-i18n.d.ts` types the literal ones);
 * `test/messages.spec.ts` and `test/account.spec.ts` pin that every one of them
 * exists in all three languages.
 */
export interface Messages {
  (key: string, values?: Record<string, string | number>): string;
  has(key: string): boolean;
}

/** `namespace` is dotted from the catalogue's root: "nazir", "nazir.Shell". */
export async function getMessages(namespace = "nazir"): Promise<Messages> {
  // The typed overload only takes the literal namespaces; `namespace` is dotted text.
  return (await getTranslations(namespace as "nazir")) as unknown as Messages;
}
