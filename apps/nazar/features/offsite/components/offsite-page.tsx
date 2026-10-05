import { Alert } from "@medaris/ui/mds/alert";
import { Breadcrumb } from "@medaris/ui/mds/breadcrumb";
import { Button } from "@medaris/ui/mds/button";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { coursesHref } from "~/features/courses/courses";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { type Read, readOnce } from "~/lib/tedrisat-read";
import { koskChoices } from "../offsite";
import { OffsiteForm } from "./offsite-form";

/** The köşks are paged (50 at most); the choice lists them all, with a stop at 500. */
const PAGE = 50;
const MAX_PAGES = 10;

const readKosks = (): Promise<Read<Array<{ id: string; name: string }>>> =>
  readOnce("the köşks", async (api) => {
    const kosks = [];
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const answer = await api.kosks.getAllKosks({ page, limit: PAGE });
      kosks.push(...answer.items);
      if (answer.items.length === 0 || kosks.length >= answer.total) break;
    }
    return koskChoices(kosks);
  });

/**
 * Medrese dışı ders talebi (nazir 09): the form that asks a köşk's nazım to
 * open a course that will not belong to the medrese. Any listed köşk may be
 * asked; the medrese needs no hosting right there. The medrese's başmüderris
 * opens the page; the API refuses a nazır of the medrese today (the role
 * matrix has no row for MEDRESE_NAZIR), so that answer is a notice and the form
 * is not drawn. The köşk list is open to everyone who signed in, so the refusal
 * is read from the medrese's own requests, the route the form's POST is behind.
 * Where no köşk is listed there is nobody to ask and the page says so.
 */
export async function OffsitePage({ madrasahId }: { madrasahId: string }) {
  const [t, listed, access] = await Promise.all([
    getMessages("nazar"),
    readKosks(),
    readOnce("the medrese's offsite requests", (api) =>
      api.madrasahs.getOffsiteCourseRequests({ id: madrasahId })
    ),
  ]);
  const listHref = coursesHref(madrasahId, { kosk: null, status: null });
  const kosks = access.status === "ok" ? listed : access;

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-2">
        <Breadcrumb
          label={t("Offsite.breadcrumb")}
          items={[
            { label: t("Courses.title"), href: listHref },
            t("Offsite.title"),
          ]}
        />
        <h1 className="mds-h1">{t("Offsite.title")}</h1>
        <p className="mds-body-sm text-neutral-muted">{t("Offsite.intro")}</p>
      </header>
      {kosks.status !== "ok" ? (
        <PageProblem
          status={kosks.status}
          failed={{
            title: t("Offsite.loadFailedTitle"),
            text: t("Offsite.loadFailed"),
          }}
        />
      ) : kosks.data.length === 0 ? (
        <Alert tone="warning" title={t("Offsite.noKoskTitle")}>
          <p>{t("Offsite.noKosk")}</p>
          <Button href={listHref} variant="outline" size="small">
            {t("Offsite.back")}
          </Button>
        </Alert>
      ) : (
        <OffsiteForm
          madrasahId={madrasahId}
          kosks={kosks.data}
          listHref={listHref}
        />
      )}
    </>
  );
}

/** The page while the köşks are read: the shell stays, and the form is bars (nazir 09 §3). */
export async function OffsiteLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="18rem" height="2.5rem" />
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <div className="flex flex-col gap-grid">
          <Skeleton height="4rem" />
          <Skeleton height="4rem" />
          <Skeleton height="9rem" />
        </div>
        <Skeleton height="14rem" />
      </div>
    </output>
  );
}
