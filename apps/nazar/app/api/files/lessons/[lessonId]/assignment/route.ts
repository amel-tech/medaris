import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * Uploads a file to a celse's homework: the editor's multipart body streamed
 * on to tedrisat's `POST /lessons/:id/assignment/files` (`session.manage`)
 * with the caller's token, and tedrisat's answer back as it came (201 with
 * the homework, or its refusal). Never a resource: tedrisat keeps the file
 * as the homework's. No session answers 401 `{ kind: "unauthenticated" }`
 * for the page to act on.
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
    path: `/lessons/${lessonId}/assignment/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  });
}
