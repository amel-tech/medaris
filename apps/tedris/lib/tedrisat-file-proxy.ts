import { NextResponse } from "next/server";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

const FORMATS = new Set(["xlsx", "csv"]);

/** `xlsx` unless the address asks for `csv`; anything else is not a format the API takes. */
export const fileFormat = (value: string | null): "xlsx" | "csv" | null =>
  value === null
    ? "xlsx"
    : FORMATS.has(value)
      ? (value as "xlsx" | "csv")
      : null;

/**
 * Hands a request on to tedrisat with the caller's own access token and gives
 * the answer back as it came, body and status included. The browser cannot call
 * tedrisat itself — the token is server-side — and the generated client reads
 * a file as JSON, so a file download or an upload goes through here. The
 * upstream's refusals (403, 404, 422 with its row errors, 429) are the page's to
 * show, so they are passed on rather than flattened into a 500.
 */
export async function proxyToTedrisat(
  path: string,
  init: { method: "GET" | "POST"; body?: FormData }
): Promise<Response> {
  const token = await getAccessToken();
  if (!token) {
    return NextResponse.json(
      { data: null, error: "Unauthorized" },
      { status: 401 }
    );
  }
  try {
    const upstream = await fetch(`${env.TEDRISAT_API_BASE_URL}${path}`, {
      method: init.method,
      body: init.body,
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    const headers = new Headers();
    for (const name of [
      "content-type",
      "content-disposition",
      "content-length",
      "retry-after",
    ]) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (error) {
    console.error("Error reaching tedrisat:", error);
    return NextResponse.json(
      { data: null, error: "Failed to reach the service" },
      { status: 502 }
    );
  }
}
