import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * Downloads a file of a celse's homework, streamed from tedrisat's
 * `GET /lessons/:id/assignment/files/:fileId`, which serves it only to a
 * reader of the course's content, as an attachment.
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
    path: `/lessons/${lessonId}/assignment/files/${fileId}`,
    accessToken: await getAccessToken(),
    request,
    signInUrl,
  });
}
