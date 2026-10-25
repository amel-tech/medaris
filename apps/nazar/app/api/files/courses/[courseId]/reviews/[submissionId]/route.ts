import {
  isUuid,
  MAX_FILE_BYTES,
  proxyUpload,
} from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken } from "~/lib/auth";

/**
 * Uploads a file to the review of a talebe's homework ("Değerlendir" on
 * Ödevler): the multipart body streamed on to tedrisat's
 * `POST /courses/:id/submissions/:submissionId/review/files`
 * (`submission.read`) with the caller's token, and tedrisat's answer back as
 * it came (201 with the homework, or its refusal). No session answers 401
 * `{ kind: "unauthenticated" }` for the page to act on.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ courseId: string; submissionId: string }> }
) {
  const { courseId, submissionId } = await params;
  if (!isUuid(courseId) || !isUuid(submissionId)) {
    return Response.json({ code: "NOT_FOUND" }, { status: 404 });
  }
  return proxyUpload(request, {
    apiBaseUrl: env.TEDRISAT_API_BASE_URL,
    path: `/courses/${courseId}/submissions/${submissionId}/review/files`,
    accessToken: await getAccessToken(),
    maxBytes: MAX_FILE_BYTES,
  });
}
