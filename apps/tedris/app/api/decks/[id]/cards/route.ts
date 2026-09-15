import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

export async function GET({ params }: { params: Promise<{ id: string }> }) {
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
    console.error("Error fetching cards:", error);
    return NextResponse.json(
      { data: null, error: "Failed to fetch cards" },
      { status: 500 }
    );
  }
}
