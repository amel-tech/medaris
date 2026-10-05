import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  isServer: typeof window === "undefined",
  emptyStringAsUndefined: false,
  server: {
    KEYCLOAK_CLIENT_ID: z.string().min(1),
    KEYCLOAK_CLIENT_SECRET: z.string().min(1),
    KEYCLOAK_ISSUER: z.string().min(1).url(),
    NEXTAUTH_URL: z.string().min(1).url(),
    NEXTAUTH_SECRET: z.string().min(1),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).url().optional(),
    OTEL_SERVICE_NAME: z.string().min(1).optional(),
    API_MOCKING: z.enum(["enabled", "disabled"]).default("disabled"),
    TEDRISAT_API_BASE_URL: z.string().min(1).url(),
    // Where the account page's "Nizam'da aç" and "Nazar'da aç" point
    // (MDRS-169). Unset or empty: the buttons are left out.
    NIZAM_URL: z.union([z.string().url(), z.literal("")]).optional(),
    NAZAR_URL: z.union([z.string().url(), z.literal("")]).optional(),
    // landing-web's origin, for the privacy-notice link (MDRS-248). Unset or
    // empty: the production site.
    LANDING_URL: z.union([z.string().url(), z.literal("")]).optional(),
  },
  // MDRS-86: no `client` block on purpose. A NEXT_PUBLIC_ value is inlined
  // into the browser bundle at `next build`, which would make the image
  // environment-specific. Everything is read on the server at request time
  // and handed to client components as props where the browser needs it.
  client: {},
  runtimeEnv: {
    KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    API_MOCKING: process.env.API_MOCKING,

    TEDRISAT_API_BASE_URL: process.env.TEDRISAT_API_BASE_URL,
    NIZAM_URL: process.env.NIZAM_URL,
    NAZAR_URL: process.env.NAZAR_URL,
    LANDING_URL: process.env.LANDING_URL,
  },
});
