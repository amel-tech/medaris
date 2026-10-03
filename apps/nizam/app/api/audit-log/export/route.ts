import { NextResponse } from "next/server";
import { env } from "~/env";
import {
  auditApiQuery,
  parseAuditFilters,
} from "~/features/platform-admin/present";
import { getAccessToken } from "~/lib/auth_options";

/**
 * "Dışa aktar" of the audit log (nizam/17): the page's filters, as the CSV
 * tedrisat builds. The browser carries no bearer token, so the download goes
 * through here; tedrisat decides who may have the file (the başnazım, a
 * Medaris nazımı holding "Denetim kaydını oku") and writes the export to the
 * log, and a refusal is passed on as it is.
 */
export async function GET(request: Request) {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const query = auditApiQuery(parseAuditFilters(params));
  const search = new URLSearchParams();
  if (query.actor) search.set("actor", query.actor);
  if (query.type) search.set("type", query.type);
  if (query.scope) search.set("scope", query.scope);
  if (query.from) search.set("from", query.from.toISOString());
  if (query.to) search.set("to", query.to.toISOString());

  try {
    const upstream = await fetch(
      `${env.TEDRISAT_API_BASE_URL}/nizam/audit-log/export?${search}`,
      { headers: { Authorization: `Bearer ${accessToken}` }, cache: "no-store" }
    );
    if (!upstream.ok) {
      return NextResponse.json(
        { error: "Export failed" },
        { status: upstream.status }
      );
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition":
          upstream.headers.get("content-disposition") ??
          'attachment; filename="denetim-kaydi.csv"',
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error("Error exporting the audit log:", error);
    return NextResponse.json({ error: "Export failed" }, { status: 502 });
  }
}
