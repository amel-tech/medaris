import { NextResponse } from "next/server";
import { env } from "~/env";
import { isTedrisIntent, tedrisEntryUrl } from "~/lib/tedris-entry";

// Read TEDRIS_APP_URL on every request, never at build time.
export const dynamic = "force-dynamic";

/**
 * `GET /api/tedris/<register|signin>` — sends the visitor to
 * tedris-web's registration or sign-in page (MDRS-101). See lib/tedris-entry.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ intent: string }> }
) {
  const { intent } = await params;
  if (!isTedrisIntent(intent)) {
    return new NextResponse(null, { status: 404 });
  }

  const tedrisAppUrl = env.TEDRIS_APP_URL;
  if (!tedrisAppUrl) {
    return new NextResponse("TEDRIS_APP_URL is not configured", {
      status: 503,
    });
  }

  return NextResponse.redirect(tedrisEntryUrl(tedrisAppUrl, intent), 307);
}
