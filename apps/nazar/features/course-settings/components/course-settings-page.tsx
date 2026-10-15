import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { env } from "~/env";
import {
  CODES,
  type CoursePermissions,
  holds,
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { controlsOf } from "../controls";
import { coursePageUrl, settingsOf } from "../course-settings";
import { showsPartnerCodes } from "../partner-codes";
import { CoursePublishCard } from "./course-publish-card";
import { CourseSettingsForm } from "./course-settings-form";
import { PartnerCodesCard } from "./partner-codes-card";

/**
 * Ders ayarları of a course: whether it is closed, its sample session,
 * whether enrolment waits for approval, its time zone, and whether it is
 * published. The page opens for a caller who holds `course.edit`,
 * `course.settings`, `course.publish` or `session.manage` in this course,
 * read from `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya
 * izniniz yok", and a read that failed is the retry state. Each control is
 * open only when the caller holds every code its route asks (`controlsOf`),
 * so no control is offered that the API would refuse; the API still decides
 * every write. Not on this page: icazet (MDRS-149), the müderris list and
 * the imam, hiding the course and the köşk's policies. The course's roster
 * is not read (`GET /courses/:id/stats` writes an audit row), so the note
 * under "Taslağa çek" names no number. The form is keyed by what it shows
 * as stored, not by the version: a read that brings other stored values (its
 * own save, someone else's) starts a fresh form, and one that only moved the
 * version ("Yayımla", "Taslağa çek") keeps what is being changed.
 *
 * "Ortak uygulama kodları" (partner enrollments, `PartnerCodesSection`) sits
 * under the form, for a caller who holds `course.partner_codes` and only when
 * the course's köşk works with a partner application.
 */
export async function CourseSettingsPage({ courseId }: { courseId: string }) {
  const [t, course, permissions] = await Promise.all([
    getMessages("nazar"),
    readOnce("the course", (api) =>
      api.courses.getCourseById({ id: courseId })
    ),
    readCoursePermissions(courseId),
  ]);
  const gate = pageGate([course], permissions, PAGE_CODES.settings);

  if (course.status !== "ok" || permissions.status !== "ok" || gate !== "ok") {
    return (
      <>
        <header className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("CourseSettings.title")}</h1>
        </header>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{
            title: t("CourseSettings.loadFailedTitle"),
            text: t("CourseSettings.loadFailed"),
          }}
        />
      </>
    );
  }
  const stored = settingsOf(course.data);
  const controls = controlsOf(permissions.data, stored);
  const pageUrl = coursePageUrl(env.TEDRIS_URL, course.data.id);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex max-inline-measure flex-col gap-1">
          <h1 className="mds-h1">{t("CourseSettings.title")}</h1>
          <p className="mds-body-sm text-neutral-muted">
            {t("CourseSettings.intro", { name: course.data.title })}
          </p>
        </div>
        {pageUrl ? (
          <Button
            href={pageUrl}
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
            iconRight={<Icon name="externalLink" size="sm" />}
          >
            {t("CourseSettings.viewPublic")}
            <span className="mds-visually-hidden">
              {" "}
              {t("CourseSettings.viewPublicHint")}
            </span>
          </Button>
        ) : null}
      </header>
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <div className="flex min-inline-0 flex-col gap-grid">
          <CourseSettingsForm
            key={JSON.stringify(stored)}
            course={course.data}
            controls={controls}
          />
          <PartnerCodesSection
            courseId={course.data.id}
            permissions={permissions.data}
          />
        </div>
        <CoursePublishCard
          courseId={course.data.id}
          title={course.data.title}
          published={course.data.status === "PUBLISHED"}
          canPublish={controls.publish}
        />
      </div>
    </>
  );
}

/**
 * "Ortak uygulama kodları", or nothing: only for a caller who holds
 * `course.partner_codes` are the course's partners read
 * (`GET /courses/:id/partner-codes`): the ones the başnazım bound to the
 * course's köşk, each with its codes for this course. A köşk with none draws
 * nothing; a read that failed says so in place, since whether there is a
 * partner is not known. The rest of the page stands either way.
 */
async function PartnerCodesSection({
  courseId,
  permissions,
}: {
  courseId: string;
  permissions: CoursePermissions;
}) {
  const allowed = holds(permissions, CODES.partnerCodes);
  if (!allowed) return null;
  const codes = await readOnce("the course's partner codes", (api) =>
    api.courses.getCoursePartnerCodes({ id: courseId })
  );
  if (codes.status !== "ok") {
    const t = await getMessages("nazar");
    return (
      <Alert tone="error" title={t("CourseSettings.partnerCodes.title")}>
        {t("CourseSettings.partnerCodes.loadFailed")}
      </Alert>
    );
  }
  if (!showsPartnerCodes(codes.data.partners.length, allowed)) return null;
  return (
    <PartnerCodesCard
      courseId={courseId}
      partners={codes.data.partners.map((partner) => ({
        id: partner.id,
        name: partner.name,
        codes: partner.codes.map((row) => row.code),
      }))}
    />
  );
}

/** The page while the course is read: the shell stays, and the form and the card are bars. */
export async function CourseSettingsLoading() {
  const t = await getMessages("nazar.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="12rem" height="2.5rem" />
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <Skeleton height="24rem" />
        <Skeleton height="12rem" />
      </div>
    </output>
  );
}
