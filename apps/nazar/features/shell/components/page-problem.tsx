import { Alert } from "@medaris/ui/mds/alert";
import { getMessages } from "~/lib/i18n/messages";
import { LoadFailed } from "./load-failed";

/**
 * What a page shows in place of a body it could not read, under the shell. A
 * 403 is a verdict on the person ("Bu sayfaya izniniz yok"); anything else is
 * a read that failed and may work in a moment, so it keeps the retry state of
 * nazir 02 and is never worded as "no access".
 */
export async function PageProblem({
  status,
  failed,
}: {
  status: "forbidden" | "failed";
  /** the failed read, in the page's own words */
  failed: { title: string; text: string };
}) {
  const [problems, shell] = await Promise.all([
    getMessages("nazar.Problems"),
    getMessages("nazar.Shell"),
  ]);
  if (status === "forbidden") {
    return (
      <Alert title={problems("forbiddenTitle")}>
        <p>{problems("forbidden")}</p>
      </Alert>
    );
  }
  return (
    <LoadFailed
      shell
      title={failed.title}
      text={failed.text}
      retry={shell("retry")}
    />
  );
}
