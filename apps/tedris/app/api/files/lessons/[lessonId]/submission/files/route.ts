import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * Adds a file to the talebe's own homework on a celse (MDRS-290): the
 * "Ödevim" card's multipart upload, streamed on to tedrisat unread with the
 * token added here (`@medaris/services/file-proxy`). tedrisat decides the
 * rest (an active talebe, at most 5 files, 25 MB, the allowed types) and its
 * status and JSON come back as they are. `proxy.ts` matches this route, so
 * the session is renewed on the way and `next.config.js` raises
 * `proxyClientMaxBodySize` above the 25 MB a file may have.
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
    path: `/lessons/${lessonId}/submission/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  });
}
