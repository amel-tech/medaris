import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * A file of the homework set on a celse, downloaded through tedrisat on the
 * terms of a celse resource's file: only to who may read the course's
 * content, as an attachment, with the token added here
 * (`@medaris/services/file-proxy`).
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
