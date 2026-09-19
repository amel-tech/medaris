import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

// Next calls a route handler as `GET(request, context)`; `params` lives on the
// second argument. Destructuring it off the first one read `params` from the
// Request, so `const { id } = await undefined` threw before any code below
// could run — including the 401 guard, whose whole point is to replace that
// crash's 500 with something the caller can act on.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const accessToken = await getAccessToken();
    if (!accessToken) {
      // No usable token — a failed refresh, not a server fault. Say 401 so the
      // caller can send the visitor to sign in instead of reading a 500.
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { cards } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );

    const result = await cards.getFlashcardById({ id });
    const card = result || null;

    if (!card) {
      return NextResponse.json({ error: "Card not found" }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error) {
    console.error("Error fetching card:", error);
    return NextResponse.json(
      { error: "Failed to fetch card" },
      { status: 500 }
    );
  }
}
