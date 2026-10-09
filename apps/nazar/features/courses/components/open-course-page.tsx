import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { PageProblem } from "~/features/shell/components/page-problem";
import { pageScope } from "~/features/shell/page-scope";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { coursesHref, koskChoiceLine, locksOf } from "../courses";
import { OpenCourseForm } from "./open-course-form";

/**
 * Medrese dersi aç (nazir 08): the form that opens a draft course of the
 * medrese in a köşk that hosts it. The köşks are the page: where they cannot be
 * read or the API refuses (a nazır of the medrese is refused today, the role
 * matrix has no row for MEDRESE_NAZIR) the form is not drawn, and where the API
 * lists none there is nothing to open a course in and the page says so. The
 * medrese's policies only lock two settings of the form: a settings read that
 * fails leaves them open, and the API applies the policies all the same.
 */
export async function OpenCoursePage({ madrasahId }: { madrasahId: string }) {
  const [t, scope, hosting, settings] = await Promise.all([
    getMessages("nazar"),
    pageScope("medrese", madrasahId),
    readOnce("the medrese's hosting köşks", (api) =>
      api.madrasahs.getMadrasahHostingKosks({ id: madrasahId })
    ),
    readOnce("the medrese settings", (api) =>
      api.madrasahs.getMadrasahSettings({ id: madrasahId })
    ),
  ]);
  const madrasahName = scope?.name ?? "";
  const listHref = coursesHref(madrasahId, { kosk: null, status: null });

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-2">
        <Breadcrumb
          label={t("OpenCourse.breadcrumb")}
          items={[
            { label: t("Courses.title"), href: listHref },
            t("OpenCourse.title"),
          ]}
        />
        <h1 className="mds-h1">{t("OpenCourse.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">
          {madrasahName
            ? t("OpenCourse.intro", { name: madrasahName })
            : t("OpenCourse.introUnnamed")}
        </p>
      </header>
      {hosting.status !== "ok" ? (
        <PageProblem
          status={hosting.status}
          failed={{
            title: t("OpenCourse.loadFailedTitle"),
            text: t("OpenCourse.loadFailed"),
          }}
        />
      ) : hosting.data.length === 0 ? (
        <Alert tone="warning" title={t("OpenCourse.noKoskTitle")}>
          <p>{t("OpenCourse.noKosk")}</p>
          <Button href={listHref} variant="outline" size="small">
            {t("OpenCourse.back")}
          </Button>
        </Alert>
      ) : (
        <OpenCourseForm
          madrasahId={madrasahId}
          kosks={hosting.data.map((kosk) => ({
            id: kosk.id,
            name: kosk.name,
            line: koskChoiceLine(kosk, t),
          }))}
          locks={locksOf(
            settings.status === "ok" ? settings.data.policies : null
          )}
          policiesUnknown={settings.status !== "ok"}
          settingsHref={`/medrese/${encodeURIComponent(madrasahId)}/ayarlar`}
        />
      )}
    </>
  );
}

/** The page while the köşks are read: the shell stays, and the form is bars (nazir 08 §3). */
export async function OpenCourseLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="16rem" height="2.5rem" />
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <div className="flex flex-col gap-grid">
          <Skeleton height="10rem" />
          <Skeleton height="4rem" />
          <Skeleton height="12rem" />
        </div>
        <Skeleton height="20rem" />
      </div>
    </output>
  );
}
