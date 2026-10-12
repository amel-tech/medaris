import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * Uploads a file as one of the course's resources (MDRS-287): the editor's
 * multipart body streamed on to tedrisat's
 * `POST /courses/:id/resources/files` with the caller's token, and tedrisat's
 * answer back as it came (201 `{ resource, courseVersion }`, or its refusal).
 * No session answers 401 `{ kind: "unauthenticated" }` for the page to act
 * on. Inside `proxy.ts`'s matcher, so the session is renewed; next.config's
 * `proxyClientMaxBodySize` lets a 25 MB body through it whole.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> }
) {
  const { courseId } = await params;
  if (!isUuid(courseId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyUpload(request, {
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/resources/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  });
}
