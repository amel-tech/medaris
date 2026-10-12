import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * A course resource's file (MDRS-287), downloaded through tedrisat, which
 * hands it only to who may read the course's content and as an attachment.
 * The browser holds no token: this route adds it on the server and streams
 * the file back with tedrisat's own headers (`@medaris/services/file-proxy`).
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
