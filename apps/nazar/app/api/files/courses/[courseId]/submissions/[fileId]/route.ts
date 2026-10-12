import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * Downloads a file a talebe handed in (MDRS-290), for the course team on
 * Ödevler: streamed from tedrisat's
 * `GET /courses/:id/submissions/files/:fileId`, which serves it only to a
 * holder of `submission.read` in the course, as an attachment, and writes the
 * download to its audit log.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string; fileId: string }> }
) {
  const { courseId, fileId } = await params;
  if (!isUuid(courseId) || !isUuid(fileId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/submissions/files/${fileId}`,
    accessToken: await getAccessToken(),
    signal: request.signal,
  });
}
