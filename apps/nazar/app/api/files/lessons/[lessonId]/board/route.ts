import { isUuid, proxyUpload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/** The largest scene tedrisat takes (`BOARD_SCENE_MAX_BYTES`): 4 MB of JSON. */
const MAX_SCENE_BYTES = 4 * 1024 * 1024;

/**
 * Saves a session's board: the scene, sent as the multipart field `file`,
 * streamed on to tedrisat's `POST /lessons/:id/board` (`session.manage`) with
 * the caller's token, and tedrisat's answer back as it came. Multipart rather
 * than JSON because a board of handwriting outgrows a JSON body. No session
 * answers 401 `{ kind: "unauthenticated" }` for the page to act on.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> }
) {
  const { lessonId } = await params;
  if (!isUuid(lessonId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyUpload(request, {
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/lessons/${lessonId}/board`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_SCENE_BYTES,
  });
}
