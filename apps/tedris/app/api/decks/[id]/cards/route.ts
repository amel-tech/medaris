import {
  createServerTedrisatAPIs,
  ResponseError,
} from "@medaris/services/tedrisat";
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
      return NextResponse.json(
        { data: null, error: "Unauthorized" },
        { status: 401 }
      );
    }
    const API = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );

    const result = await API.cards.getFlashcardByDeckId({
      deckId: id,
      include: ["progress"],
    });

    return NextResponse.json({ data: result || [], error: null });
  } catch (error) {
    // tedrisat's own refusal, not our fault: `assertVisibleTo` throws 403 for
    // another user's private deck and 404 for one that is gone, and the
    // generated client turns both into a `ResponseError`. Flattening them into
    // the 500 below told the caller the server was broken — the same erasure
    // the 401 above was added to stop.
    if (
      error instanceof ResponseError &&
      (error.response.status === 403 || error.response.status === 404)
    ) {
      const message = error.response.status === 403 ? "Forbidden" : "Not found";
      return NextResponse.json(
        { data: null, error: message },
        {
          status: error.response.status,
        }
      );
    }
    console.error("Error fetching cards:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}
