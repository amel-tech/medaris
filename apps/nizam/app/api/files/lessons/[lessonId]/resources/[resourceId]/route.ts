import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * A file of a session's own resources, downloaded from the curriculum
 * (MDRS-287): streamed from tedrisat's
 * `GET /lessons/:id/resources/:resourceId/file`, which serves it only to a
 * reader of the course's content and only while the session is live, as an
 * attachment with the headers tedrisat set and no other.
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
    request,
    signInUrl,
  });
}
