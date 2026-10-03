import { resources } from "@medaris/i18n";

/**
 * The client hooks of next-intl without a Next request: the real Turkish
 * catalogue (ICU included) behind `useTranslations`, a fixed locale. Used as
 * `vi.mock("next-intl", async (orig) => intlMock(await orig()))`. It takes
 * `createTranslator` from the real module it is handed: importing "next-intl"
 * here would wait on the mock that is waiting on this file.
 */
export const intlMock = (
  real: Record<string, unknown> & {
    createTranslator: typeof import("next-intl").createTranslator;
  }
) => ({
  ...real,
  useLocale: () => "tr",
  useTimeZone: () => "Europe/Istanbul",
  useTranslations: (namespace: string) => {
    // "tedris.X" and "tedrisAccount.X" are namespaces of the app's catalogue;
    // the translator is rooted at the namespace's own messages.
    const [root, ...rest] = namespace.split(".");
    const messages =
      root === "tedrisAccount"
        ? resources.tr.tedrisAccount
        : resources.tr.tedris;
    return real.createTranslator({
      locale: "tr",
      messages,
      namespace: rest.join(".") as never,
    });
  },
});
