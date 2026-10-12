import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * A celse resource's file (MDRS-287), downloaded through tedrisat on the
 * same terms as the course's: only to who may read the course's content,
 * as an attachment, with the token added here (`@medaris/services/file-proxy`).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; resourceId: string }> }
) {
  const { lessonId, resourceId } = await params;
  if (!isUuid(lessonId) || !isUuid(resourceId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/lessons/${lessonId}/resources/${resourceId}/file`,
    accessToken: await getAccessToken(),
    signal: request.signal,
  });
}
