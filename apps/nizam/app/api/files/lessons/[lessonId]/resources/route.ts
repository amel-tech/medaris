import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * "Dosya yükle" on a session's own resources in the curriculum (MDRS-287):
 * the file goes on to tedrisat's `POST /lessons/:id/resources/files` as it
 * arrives, with the caller's token added here; tedrisat checks
 * `session.manage`, that the session is live, the size and the type, and its
 * answer comes back as it is. Inside `proxy.ts`'s matcher, like the course's.
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
    path: `/lessons/${lessonId}/resources/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  });
}
