import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * Uploads a file as one of a celse's own resources (MDRS-287): the editor's
 * multipart body streamed on to tedrisat's
 * `POST /lessons/:id/resources/files` (`session.manage`) with the caller's
 * token, and tedrisat's answer back as it came (201
 * `{ resource, courseVersion }`, or its refusal). No session answers 401
 * `{ kind: "unauthenticated" }` for the page to act on.
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
