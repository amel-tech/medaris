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
    // auth Phase 2: where the sessions live (WEB__AUTH_STORE_URL, a redis:// URL
    // with the environment's Valkey user) and the environment's key prefix
    // (WEB__AUTH_STORE_KEY_PREFIX, `dev` or `prod`). Unset or empty: the
    // session stays sealed in the cookie, as in Phase 1.
    AUTH_STORE_URL: z.string().optional(),
    AUTH_STORE_KEY_PREFIX: z.string().optional(),
    // How many sign-ins one browser may start in a window
    // (WEB__AUTH_SIGN_IN_LIMIT), written <count>/<seconds>, e.g. `30/60` on
    // a test deployment. Unset or empty: 5 in 5 minutes. `parseSignInLimit`
    // in lib/auth.ts rejects anything else at boot.
    AUTH_SIGN_IN_LIMIT: z.string().optional(),
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).url().optional(),
    OTEL_SERVICE_NAME: z.string().min(1).optional(),
    API_MOCKING: z.enum(["enabled", "disabled"]).default("disabled"),
    TEDRISAT_API_BASE_URL: z.string().min(1).url(),
    // Where "Tedris’e dön" goes (nazir 02). Empty or absent hides the link.
    TEDRIS_URL: z.union([z.string().url(), z.literal("")]).optional(),
  },
  // MDRS-86: no `client` block on purpose — see apps/tedris/env.ts.
  client: {},
  runtimeEnv: {
    KEYCLOAK_CLIENT_ID: process.env.KEYCLOAK_CLIENT_ID,
    KEYCLOAK_CLIENT_SECRET: process.env.KEYCLOAK_CLIENT_SECRET,
    KEYCLOAK_ISSUER: process.env.KEYCLOAK_ISSUER,
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    NEXTAUTH_URL: process.env.NEXTAUTH_URL,
    NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
    AUTH_STORE_URL: process.env.AUTH_STORE_URL,
    AUTH_STORE_KEY_PREFIX: process.env.AUTH_STORE_KEY_PREFIX,
    AUTH_SIGN_IN_LIMIT: process.env.AUTH_SIGN_IN_LIMIT,
    API_MOCKING: process.env.API_MOCKING,

    TEDRISAT_API_BASE_URL: process.env.TEDRISAT_API_BASE_URL,
    TEDRIS_URL: process.env.TEDRIS_URL,
  },
});
