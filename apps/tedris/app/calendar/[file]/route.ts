import { NextResponse } from "next/server";
import { env } from "~/env";

// `<token>.ics`: 43 base64url characters. Checked before it reaches a URL.
const FEED_FILE = /^[A-Za-z0-9_-]{43}\.ics$/;

/**
 * The personal calendar feed (MDRS-120), at the address Apple Calendar and
 * Google Calendar subscribe to: `/calendar/<token>.ics` on tedris-web, which
 * is public, passed on to tedrisat's `GET /calendar/<token>.ics`.
 *
 * No session: a calendar app cannot sign in, so the secret in the URL is the
 * credential and tedrisat decides everything — which feed it is, what is in
 * it. The middleware does not run here (its matcher skips paths with a dot),
 * so there is no sign-in redirect and no locale prefix.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> }
) {
  const { file } = await params;
  if (!FEED_FILE.test(file)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let upstream: Response;
  try {
    // Joined like the generated client joins its paths, so a base URL with
    // a path prefix keeps it.
    const base = env.TEDRISAT_API_BASE_URL.replace(/\/+$/, "");
    upstream = await fetch(`${base}/calendar/${file}`, { cache: "no-store" });
  } catch (error) {
    console.error("Error fetching the calendar feed:", error);
    return NextResponse.json(
      { error: "Failed to fetch the calendar feed" },
      { status: 502 }
    );
  }

  if (!upstream.ok) {
    // 404 no such feed, 429 too many refreshes, 503 not configured — passed
    // on with tedrisat's error code, never with anything about the token.
    const body = (await upstream.json().catch(() => null)) as {
      code?: unknown;
    } | null;
    const headers = new Headers({ "Cache-Control": "no-store" });
    const retryAfter = upstream.headers.get("Retry-After");
    if (retryAfter) headers.set("Retry-After", retryAfter);
    return NextResponse.json(
      {
        error:
          typeof body?.code === "string"
            ? body.code
            : `HTTP_${upstream.status}`,
      },
      { status: upstream.status, headers }
    );
  }

  return new Response(await upstream.text(), {
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="medaris.ics"',
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
