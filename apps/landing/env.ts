import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  isServer: typeof window === "undefined",
  emptyStringAsUndefined: false,
  server: {
    OTEL_EXPORTER_OTLP_ENDPOINT: z.string().min(1).url().optional(),
    OTEL_SERVICE_NAME: z.string().min(1).optional(),
    // tedris-web's public origin (MDRS-101): where "Kayıt ol" and "Giriş yap"
    // lead. Read per request by app/api/tedris/[intent]/route.ts, so the page
    // stays static and one image serves every environment. Optional so a
    // build never needs it; unset, those two links answer 503.
    TEDRIS_APP_URL: z.string().min(1).url().optional(),
    // The İletişim form's SMTP sender (LANDING__SMTP_* in the root .env).
    // Optional: unset, /api/iletisim answers 503. lib/contact-mail.ts checks
    // the combination when a message is sent.
    SMTP_HOST: z.string().optional(),
    SMTP_SECURITY: z.string().optional(),
    SMTP_PORT: z.string().optional(),
    SMTP_FROM: z.string().optional(),
    SMTP_FROM_DISPLAY_NAME: z.string().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASSWORD: z.string().optional(),
  },
  // MDRS-86: no `client` block on purpose — see apps/tedris/env.ts.
  // NEXT_PUBLIC_TEDRIS_APP_URL was declared here and read nowhere.
  client: {},
  runtimeEnv: {
    OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
    OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME,
    TEDRIS_APP_URL: process.env.TEDRIS_APP_URL,
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_SECURITY: process.env.SMTP_SECURITY,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_FROM: process.env.SMTP_FROM,
    SMTP_FROM_DISPLAY_NAME: process.env.SMTP_FROM_DISPLAY_NAME,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
  },
});
