import { isUuid, proxyDownload } from "@medaris/services/file-proxy";
import { env } from "~/env";
import { getAccessToken, signInUrl } from "~/lib/auth";

/**
 * One of the talebe's own homework files (MDRS-290), downloaded through
 * tedrisat, which hands it to the talebe who handed it in and no one else
 * (staff read homework in nazar), as an attachment, with the token added
 * here (`@medaris/services/file-proxy`).
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
    path: `/lessons/${lessonId}/submission/files/${fileId}`,
    accessToken: await getAccessToken(),
    request,
    signInUrl,
  });
}
