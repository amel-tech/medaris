import type { resources } from "@medaris/i18n";

declare module "next-intl" {
  interface AppConfig {
    Messages: {
      /* Loading only common and nazir namespaces
       to ensure type safety in `getTranslations` */
      common: typeof resources.en.common;
      nazir: typeof resources.en.nazir;
    };
  }
}
