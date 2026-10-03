import { NextResponse } from "next/server";
import { fileFormat, proxyToTedrisat } from "~/lib/tedrisat-file-proxy";

/** The import template (design tedris/29): the same for every deck. */
export async function GET(request: Request) {
  const format = fileFormat(new URL(request.url).searchParams.get("format"));
  if (!format) {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  return proxyToTedrisat(`/flashcard/cards/bulk/sample?format=${format}`, {
    method: "GET",
  });
}
