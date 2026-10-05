import { Alert } from "@medaris/ui/mds/alert";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { CoverPattern } from "@medaris/ui/mds/cover-pattern";
import { EmptyState } from "@medaris/ui/mds/empty-state";
import { Icon } from "@medaris/ui/mds/icon";
import { Skeleton } from "@medaris/ui/mds/skeleton";
import { DEFAULT_TIME_ZONE, resolveTimeZone } from "@medaris/utils";
import Link from "next/link";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { env } from "~/env";
import { getViewer } from "~/features/account/reads";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import {
  courseMeta,
  medresePageUrl,
  POLICY_TIERS,
  snapshotOf,
} from "../settings";
import { SettingsForm } from "./settings-form";

function Card({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <section
      aria-labelledby={id}
      className="mds-card flex flex-col gap-section p-card"
    >
      <h2 className="mds-h3" id={id}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/**
 * Medrese ayarları (nazir 04): the form on the left; on the right the four
 * levels a policy has to pass and the courses it applies to. The settings are
 * the page — a read that fails or is refused leaves the heading and says so
 * where the form would be (a nazır of the medrese is refused by the API today,
 * so the fields are not shown read-only). The courses are only a side list: if
 * they cannot be read, their card says so and the form stays.
 */
export async function SettingsPage({ madrasahId }: { madrasahId: string }) {
  const [t, locale, me, settings, courses] = await Promise.all([
    getMessages("nazir"),
    getLocale(),
    getViewer(),
    readOnce("the medrese settings", (api) =>
      api.madrasahs.getMadrasahSettings({ id: madrasahId })
    ),
    readOnce("the medrese's courses", (api) =>
      api.madrasahs.getMadrasahCourses({ id: madrasahId })
    ),
  ]);
  const timeZone = resolveTimeZone(me?.timeZone, DEFAULT_TIME_ZONE);
  const pageUrl = medresePageUrl(env.TEDRIS_URL, madrasahId);

  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="mds-h1">{t("Settings.title")}</h1>
          <p className="mds-body-sm text-neutral-muted">
            {t("Settings.subtitle")}
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
            {t("Settings.viewPage")}
            <span className="mds-visually-hidden">
              {" "}
              {t("Settings.viewPageHint")}
            </span>
          </Button>
        ) : null}
      </header>

      {settings.status !== "ok" ? (
        <PageProblem
          status={settings.status}
          failed={{
            title: t("Settings.loadFailedTitle"),
            text: t("Settings.loadFailed"),
          }}
        />
      ) : (
        <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
          <SettingsForm
            madrasahId={madrasahId}
            initial={snapshotOf(settings.data)}
            timeZone={timeZone}
          />
          <div className="flex min-inline-0 flex-col gap-grid">
            <Card id="tiers-heading" title={t("Settings.tiersTitle")}>
              <p>{t("Settings.tiersIntro")}</p>
              <ol className="flex flex-col" data-testid="policy-tiers">
                {POLICY_TIERS.map((tier) => (
                  <li
                    key={tier.id}
                    className="flex items-start gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                  >
                    <Icon name={tier.icon} size="sm" className="mbs-1" />
                    <span className="flex min-inline-0 grow flex-col">
                      <span className="font-medium">
                        <bdi>
                          {tier.id === "medrese"
                            ? settings.data.name
                            : t(`Settings.tiers.${tier.id}.name`)}
                        </bdi>
                      </span>
                      <span className="mds-caption">
                        {t(`Settings.tiers.${tier.id}.help`)}
                      </span>
                    </span>
                    {tier.id === "medrese" ? (
                      <Badge variant="info">{t("Settings.thisPage")}</Badge>
                    ) : null}
                  </li>
                ))}
              </ol>
            </Card>
            <Card id="courses-heading" title={t("Settings.coursesTitle")}>
              {courses.status !== "ok" ? (
                <Alert tone="error">
                  <p>{t("Settings.coursesFailed")}</p>
                </Alert>
              ) : courses.data.length === 0 ? (
                <EmptyState>{t("Settings.coursesEmpty")}</EmptyState>
              ) : (
                <ul className="flex flex-col" data-testid="policy-courses">
                  {courses.data.map((course) => (
                    <li
                      key={course.id}
                      className="flex items-start gap-3 py-3 border-be border-neutral-subtle last:border-be-0"
                    >
                      <CoverPattern seed={course.id} size="xs" label="" />
                      <span className="flex min-inline-0 grow flex-col">
                        <span className="font-medium">
                          <bdi>{course.title}</bdi>
                        </span>
                        <span className="mds-caption">
                          <bdi>
                            {courseMeta(course, {
                              imam: t("Settings.imam"),
                              locale,
                            })}
                          </bdi>
                        </span>
                      </span>
                      <Badge
                        variant={
                          course.status === "PUBLISHED" ? "primary" : "outline"
                        }
                      >
                        {t(`Settings.status.${course.status}`)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
              <Link
                href={`/medrese/${encodeURIComponent(madrasahId)}/dersler`}
                className="mds-btn mds-btn--small mds-btn--link self-start"
              >
                {t("Settings.coursesLink")}
              </Link>
            </Card>
          </div>
        </div>
      )}
    </>
  );
}

/** The page while the settings are read: the shell stays, and the form's fields are bars (nazir 04 §3). */
export async function SettingsLoading() {
  const t = await getMessages("nazir.Shell");
  return (
    <output className="flex flex-col gap-section" aria-busy="true">
      <span className="mds-visually-hidden">{t("loadingLabel")}</span>
      <Skeleton width="16rem" height="2.5rem" />
      <div className="grid gap-grid md:grid-cols-[minmax(0,1fr)_var(--layout-aside)] md:items-start">
        <div className="flex flex-col gap-grid">
          <Skeleton height="14rem" />
          <Skeleton height="16rem" />
        </div>
        <div className="flex flex-col gap-grid">
          <Skeleton height="12rem" />
          <Skeleton height="10rem" />
        </div>
      </div>
    </output>
  );
}
