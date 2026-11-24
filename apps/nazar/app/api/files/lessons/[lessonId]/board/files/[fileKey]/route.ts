import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/** The id the canvas gives an image; tedrisat's `BOARD_FILE_KEY`. */
const FILE_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * An image of a session's board, streamed from tedrisat's
 * `GET /lessons/:id/board/files/:fileKey`, which serves it only to a reader
 * of the course's content. The canvas fetches it and draws it; it is never
 * opened as a page.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string; fileKey: string }> }
) {
  const { lessonId, fileKey } = await params;
  if (!isUuid(lessonId) || !FILE_KEY.test(fileKey)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyDownload({
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/lessons/${lessonId}/board/files/${fileKey}`,
    accessToken: await getAccessToken(),
    request,
    signInUrl,
  });
}
