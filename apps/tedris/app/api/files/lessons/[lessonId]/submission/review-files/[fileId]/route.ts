import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * Downloads a file the course team returned with its review of the talebe's
 * own homework: streamed from tedrisat's
 * `GET /lessons/:id/submission/review-files/:fileId`, which serves it only to
 * that talebe, once the review is sent, as an attachment.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; fileId: string }> }
) {
  const { lessonId, fileId } = await params;
  if (!isUuid(lessonId) || !isUuid(fileId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/lessons/${lessonId}/submission/review-files/${fileId}`,
    accessToken: await getAccessToken(),
    request,
    signInUrl,
  });
}
