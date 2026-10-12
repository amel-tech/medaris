import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * A file of the course's resources, downloaded from the curriculum (MDRS-287):
 * streamed from tedrisat's `GET /courses/:id/resources/:resourceId/file`,
 * which serves it only to a reader of the course's content, as an attachment
 * with the headers tedrisat set and no other.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string; resourceId: string }> }
) {
  const { courseId, resourceId } = await params;
  if (!isUuid(courseId) || !isUuid(resourceId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/resources/${resourceId}/file`,
    accessToken: await getAccessToken(),
    request,
    signInUrl,
  });
}
