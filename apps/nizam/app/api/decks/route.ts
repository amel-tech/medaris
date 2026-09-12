import { createServerTedrisatAPIs } from "@medaris/services/tedrisat";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

export async function GET() {
  try {
    const accessToken = await getAccessToken();
    const { decks } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );

    const result = await decks.getAllFlashcardDecks();
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
