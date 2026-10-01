import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  isServer: typeof window === "undefined",
  emptyStringAsUndefined: false,
  server: {
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).url().optional(),
    OTEL_SERVICE_NAME: z.string().min(1).optional(),
    // MDRS-151: tedris-web's origin, for the redirect routes in app/giris,
    // app/kayit and app/tedris. Optional here so `next build` needs no
    // deployment value; lib/tedris.ts refuses to redirect without it.
    TEDRIS_URL: z.string().url().optional(),
  },
  // MDRS-86: no `client` block on purpose — see apps/tedris/env.ts.
  // NEXT_PUBLIC_TEDRIS_APP_URL was declared here and read nowhere.
  client: {},
  runtimeEnv: {
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    TEDRIS_URL: process.env.TEDRIS_URL,
  },
});
