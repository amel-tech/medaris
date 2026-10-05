import { Alert } from "@medaris/ui/mds/alert";
import { Avatar } from "@medaris/ui/mds/avatar";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { getTranslations } from "next-intl/server";
import type { TaskRow } from "../landing";
import { LoadFailedToast } from "./load-failed-toast";

type Messages = (
  key: string,
  values?: Record<string, string | number>
) => string;

/**
 * "Bu işler Nazır'da" (design nizam/04): for someone whose roles are the
 * medrese's and the course's, none of which Nizam serves. The list is read
 * only; the one way on is the button to Nazır.
 */
export async function NazarRedirectPage({
  rows,
  nazarUrl,
  failed,
  retryHref,
}: {
  /** null when the roles could not be read */
  rows: TaskRow[] | null;
  nazarUrl: string | null;
  failed: boolean;
  retryHref: string;
}) {
  const t = (await getTranslations(
    "nizam.NazarRedirectPage"
  )) as unknown as Messages;

  return (
    <div className="mx-auto flex max-w-[40rem] flex-col items-center gap-section px-gutter py-12 text-center">
      <header className="flex flex-col gap-3">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="mds-reading">{t("intro")}</p>
      </header>

      {failed || rows === null ? (
        <>
          <LoadFailedToast
            title={t("loadFailedTitle")}
            description={t("loadFailed")}
          />
          <Alert
            tone="error"
            title={t("loadFailedTitle")}
            className="w-full text-start"
          >
            <p>{t("loadFailed")}</p>
            <Button href={retryHref} variant="outline" size="small">
              {t("retry")}
            </Button>
          </Alert>
        </>
      ) : rows.length === 0 ? (
        <EmptyState>{t("empty")}</EmptyState>
      ) : (
        <section
          aria-labelledby="tasks-heading"
          className="mds-card w-full p-card text-start"
        >
          <h2 className="mds-h3" id="tasks-heading">
            {t("tasks")}
          </h2>
          <ul>
            {rows.map((row) => (
              <li
                key={row.id}
                className="flex items-center gap-3 border-be py-3 last:border-0"
                data-testid="task-row"
              >
                {row.kind === "madrasah" ? (
                  <Avatar name={row.title} size="md" entity decorative />
                ) : (
                  <CoverPattern seed={row.id} size="xs" label="" />
                )}
                <span className="flex min-w-0 grow flex-col">
                  <bdi>{row.title}</bdi>
                  <span className="mds-caption">
                    {[
                      t(`roles.${row.roleKey}`),
                      row.koskName,
                      row.studentCount === null
                        ? null
                        : t("students", { count: row.studentCount }),
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
                {row.isImam || row.draft ? (
                  <span className="flex flex-col items-end gap-1">
                    {row.isImam ? (
                      <Badge variant="secondary">{t("imam")}</Badge>
                    ) : null}
                    {row.draft ? (
                      <Badge variant="outline">{t("draft")}</Badge>
                    ) : null}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      {nazarUrl ? (
        <Button
          href={nazarUrl}
          variant="primary"
          iconRight={<Icon name="arrowRight" size="sm" />}
        >
          {t("goToNazar")}
        </Button>
      ) : null}
    </div>
  );
}
