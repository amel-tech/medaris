import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

export async function GET() {
  try {
    // Check if mocking is enabled
    // Direct API usage - no wrapper layers
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

    const result = await API.decks.getAllFlashcardDecks();

    return NextResponse.json({ data: result, error: null });
  } catch (error) {
    console.error("Error fetching decks:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch decks" },
      { status: 500 }
    );
  }
}
