import { NextResponse } from "next/server";
import { fileFormat, proxyToTedrisat } from "~/lib/tedrisat-file-proxy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The deck's cards as a file (design tedris/29, "Dışa aktar"); only the deck's author gets one. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const format = fileFormat(new URL(request.url).searchParams.get("format"));
  if (!UUID.test(id) || !format) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  return proxyToTedrisat(
    `/flashcard/decks/${id}/cards/bulk/export?format=${format}`,
    { method: "GET" }
  );
}
