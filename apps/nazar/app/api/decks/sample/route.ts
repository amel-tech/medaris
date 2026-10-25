import { unstable_rethrow } from "next/navigation";
import { tedrisatApi } from "~/lib/tedrisat-api";

/**
 * The card import's sample template (`GET /flashcard/cards/bulk/sample`),
 * sent to the browser as a download. Signed-in callers only: `tedrisatApi`
 * sends a caller without a session to sign-in.
 */
export async function GET(request: Request) {
  const format =
    new URL(request.url).searchParams.get("format") === "csv" ? "csv" : "xlsx";
  try {
    const api = await tedrisatApi();
    const file = await api.cards.getSampleFile({ format });
    return new Response(file as unknown as Blob, {
      headers: {
        "Content-Type":
          format === "csv"
            ? "text/csv; charset=utf-8"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="deste-ornek.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Error fetching the deck sample:", error);
    return new Response(null, { status: 502 });
  }
}
