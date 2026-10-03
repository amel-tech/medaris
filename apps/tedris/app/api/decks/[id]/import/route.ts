import { NextResponse } from "next/server";
import { proxyToTedrisat } from "~/lib/tedrisat-file-proxy";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A CSV or Excel file of cards into the deck (design tedris/29, "İçe aktar"); only the deck's author may. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const incoming = await request.formData().catch(() => null);
  const file = incoming?.get("file");
  if (!UUID.test(id) || !(file instanceof File)) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const body = new FormData();
  body.set("file", file, file.name);
  return proxyToTedrisat(`/flashcard/decks/${id}/cards/bulk/import`, {
    method: "POST",
    body,
  });
}
