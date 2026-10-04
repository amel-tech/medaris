import { z } from "zod";
import { env } from "~/env";
import { contactTopics } from "~/lib/contact";
import {
  isBareAddress,
  readSmtpConfig,
  SmtpConfigError,
  sendContactMessage,
} from "~/lib/contact-mail";

// The İletişim form posts here; the message is e-mailed to
// CONTACT_ADDRESS with the visitor as Reply-To. Without an SMTP sender it
// answers 503 and the form tells the visitor where to write instead. It never
// pretends a message was delivered.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const topicValues = contactTopics.map((t) => t.value) as [string, ...string[]];

const body = z.object({
  ad: z.string().trim().min(1).max(120),
  eposta: z.string().trim().max(254).refine(isBareAddress),
  konu: z.enum(topicValues),
  mesaj: z.string().trim().min(1).max(5000),
});

// A per-process throttle: enough to stop a script filling the inbox, not a
// substitute for one at the edge. Each instance keeps its own window.
const WINDOW_MS = 10 * 60 * 1000;
const PER_SENDER = 5;
const OVERALL = 60;
const sent = new Map<string, number[]>();
let overall: number[] = [];

function allow(sender: string, now: number): boolean {
  const recent = (sent.get(sender) ?? []).filter((t) => now - t < WINDOW_MS);
  overall = overall.filter((t) => now - t < WINDOW_MS);
  if (recent.length >= PER_SENDER || overall.length >= OVERALL) {
    sent.set(sender, recent);
    return false;
  }
  recent.push(now);
  overall.push(now);
  sent.set(sender, recent);
  return true;
}

/** Test seam: forget every sender. */
export function resetThrottle() {
  sent.clear();
  overall = [];
}

const senderOf = (request: Request) =>
  request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
  request.headers.get("x-real-ip")?.trim() ||
  "unknown";

export async function POST(request: Request) {
  let config: ReturnType<typeof readSmtpConfig>;
  try {
    config = readSmtpConfig({
      SMTP_HOST: env.SMTP_HOST,
      SMTP_SECURITY: env.SMTP_SECURITY,
      SMTP_PORT: env.SMTP_PORT,
      SMTP_FROM: env.SMTP_FROM,
      SMTP_FROM_DISPLAY_NAME: env.SMTP_FROM_DISPLAY_NAME,
      SMTP_USER: env.SMTP_USER,
      SMTP_PASSWORD: env.SMTP_PASSWORD,
    });
  } catch (error) {
    if (!(error instanceof SmtpConfigError)) throw error;
    console.error(`İletişim form: SMTP is misconfigured: ${error.message}`);
    config = null;
  }
  if (!config) {
    console.error(
      "İletişim form: no SMTP sender is configured; message not sent"
    );
    return Response.json(
      { error: "contact-delivery-not-configured" },
      { status: 503 }
    );
  }

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      {
        error: "invalid",
        fields: [...new Set(parsed.error.issues.map((i) => String(i.path[0])))],
      },
      { status: 400 }
    );
  }

  if (!allow(senderOf(request), Date.now())) {
    return Response.json({ error: "too-many" }, { status: 429 });
  }

  try {
    await sendContactMessage(config, parsed.data);
  } catch (error) {
    console.error(
      `İletişim form: sending failed: ${error instanceof Error ? error.message : String(error)}`
    );
    return Response.json({ error: "contact-send-failed" }, { status: 502 });
  }
  return Response.json({ ok: true });
}
