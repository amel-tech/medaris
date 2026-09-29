import {
  createServerTedrisatAPIs,
  GetLessonCalendarLocaleEnum,
  ResponseError,
} from "@medaris/services/tedrisat";
import { NextResponse } from "next/server";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth_options";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LOCALES: readonly string[] = Object.values(GetLessonCalendarLocaleEnum);

/**
 * "Takvime ekle" → Apple Calendar / Outlook (MDRS-117).
 *
 * The browser cannot send the access token itself (it stays on the server
 * since MDRS-28), so this handler fetches `GET /lessons/:id/calendar.ics`
 * from tedrisat with it and hands the file on. tedrisat decides who may have
 * it — the same rule as the session page — and builds its content.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  // Checked before it reaches a header or a URL.
  if (!UUID_REGEX.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const locale = url.searchParams.get("locale") ?? "";

  // Opened as a download link, so a JSON 401 would just be a broken file.
  // Sign in, then come back here and download.
  const back = `/api/lessons/${id}/calendar${LOCALES.includes(locale) ? `?locale=${locale}` : ""}`;
  const signIn = () =>
    NextResponse.redirect(
      new URL(
        `/api/auth/signin?callbackUrl=${encodeURIComponent(back)}`,
        env.NEXTAUTH_URL
      )
    );

  const accessToken = await getAccessToken();
  if (!accessToken) return signIn();

  try {
    const { lessons } = await createServerTedrisatAPIs(
      accessToken,
      env.TEDRISAT_API_BASE_URL
    );
    const ics = await lessons.getLessonCalendar({
      id,
      locale: LOCALES.includes(locale)
        ? (locale as GetLessonCalendarLocaleEnum)
        : undefined,
    });
    return new Response(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="medaris-${id}.ics"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    // tedrisat's own answers are passed on rather than flattened into a 500:
    // 404 not visible, 409 no time, 503 not configured. A token tedrisat
    // refuses is treated like a missing one.
    if (error instanceof ResponseError) {
      const status = error.response.status;
      if (status === 401) return signIn();
      if ([400, 403, 404, 409, 503].includes(status)) {
        const body = (await error.response.json().catch(() => null)) as {
          code?: unknown;
        } | null;
        return NextResponse.json(
          {
            error:
              typeof body?.code === "string" ? body.code : `HTTP_${status}`,
          },
          { status }
        );
      }
    }
    console.error("Error fetching lesson calendar:", error);
    return NextResponse.json(
      { error: "Failed to fetch the calendar file" },
      { status: 500 }
    );
  }
}
