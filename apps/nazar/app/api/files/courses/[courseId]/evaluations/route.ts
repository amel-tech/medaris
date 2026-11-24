import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { getLocale } from "next-intl/server";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * "Excel indir" on Değerlendirme (MDRS-248): the board as an .xlsx, streamed
 * from tedrisat's `GET /courses/:id/evaluations/export`, which serves it only
 * to a holder of `session.manage` in the course. Headers and words follow the
 * viewer's language.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  if (!isUuid(courseId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  const locale = await getLocale();
  const lang = locale === "en" || locale === "ar" ? locale : "tr";
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/evaluations/export?lang=${lang}`,
    accessToken: await getAccessToken(),
    request,
    signInUrl,
  });
}
