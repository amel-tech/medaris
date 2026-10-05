import type { resources } from "@medaris/i18n";

declare module "next-intl" {
  interface AppConfig {
    Messages: {
      /* Loading only common and nazar namespaces
       to ensure type safety in `getTranslations` */
      common: typeof resources.en.common;
      nazar: typeof resources.en.nazar;
    };
  }
}
