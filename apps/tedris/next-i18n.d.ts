import { resources } from "@medaris/i18n";

declare module "next-intl" {
  interface AppConfig {
    Messages: {
      /* Loading only common and tedris namespaces
       to ensure type safety in `getTranslations` */
      common: typeof resources.en.common;
      tedris: typeof resources.en.tedris;
      /* A second namespace for the study and home screens (MDRS-165): the
         tedris one is at the edge of TS2589, see docs/migration. */
      tedrisLearn: typeof resources.en.tedrisLearn;
    };
  }
}
