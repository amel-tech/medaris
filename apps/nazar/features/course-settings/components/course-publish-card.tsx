"use client";

import { AlertDialog } from "@medaris/ui/mds/alert-dialog";
import { Badge } from "@medaris/ui/mds/badge";
import { Button } from "@medaris/ui/mds/button";
import { useToaster } from "@medaris/ui/mds/toast";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import type { Messages } from "~/lib/i18n/messages";
import { setCourseStatus } from "../actions";
import { courseSettingsErrorKey } from "../course-settings";

/**
 * "Yayın" of Ders ayarları: whether the course is published, and for a
 * caller who holds `course.edit` and `course.publish` the one button that
 * changes it. "Yayımla" publishes at once; "Taslağa çek" asks first, in an
 * AlertDialog whose focus starts on "Vazgeç" (_kurallar 11, 13). Each sends
 * `{ status }` alone. Anyone else sees the status only.
 */
export function CoursePublishCard({
  courseId,
  title,
  published,
  canPublish,
}: {
  courseId: string;
  /** the course's title, for the question and the toast */
  title: string;
  published: boolean;
  /** `course.edit` and `course.publish`: the buttons are drawn */
  canPublish: boolean;
}) {
  const t = useTranslations("nazar");
  const words = t as unknown as Messages;
  const router = useRouter();
  const { notify } = useToaster();
  const [pending, startTransition] = useTransition();
  const [asking, setAsking] = useState(false);

  const change = (status: "DRAFT" | "PUBLISHED") =>
    startTransition(async () => {
      const result = await setCourseStatus(courseId, status);
      setAsking(false);
      if (!result.success) {
        notify({
          tone: "error",
          title: t("CourseSettings.publishFailed"),
          description: words(courseSettingsErrorKey(result.code)),
        });
        return;
      }
      notify({
        title: t(
          status === "DRAFT"
            ? "CourseSettings.drafted"
            : "CourseSettings.published"
        ),
        description: t("CourseSettings.savedBody", { name: title }),
      });
      router.refresh();
    });

  return (
    <section
      aria-labelledby="course-publish-heading"
      className="mds-card flex flex-col gap-3 p-card"
      data-testid="course-publish"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="mds-h3" id="course-publish-heading">
          {t("CourseSettings.publishTitle")}
        </h2>
        <Badge variant={published ? "success" : "secondary"}>
          {t(
            published
              ? "CourseSettings.statusPublished"
              : "CourseSettings.statusDraft"
          )}
        </Badge>
      </div>
      <p>
        {t(
          published
            ? "CourseSettings.publishedBody"
            : "CourseSettings.draftBody"
        )}
      </p>
      {canPublish ? (
        <>
          {published ? (
            <p className="mds-caption">{t("CourseSettings.unpublishNote")}</p>
          ) : null}
          <div>
            {published ? (
              <Button variant="secondary" onClick={() => setAsking(true)}>
                {t("CourseSettings.unpublish")}
              </Button>
            ) : (
              <Button
                variant="secondary"
                loading={pending}
                onClick={() => change("PUBLISHED")}
              >
                {t("CourseSettings.publish")}
              </Button>
            )}
          </div>
          <AlertDialog
            open={asking}
            onOpenChange={(open) => {
              if (!pending) setAsking(open);
            }}
            eyebrow={title}
            title={t("CourseSettings.unpublishTitle")}
            confirmLabel={t("CourseSettings.unpublishConfirm")}
            cancelLabel={t("CourseSettings.cancel")}
            closeLabel={t("CourseSettings.close")}
            confirmLoading={pending}
            onConfirm={() => change("DRAFT")}
          >
            <p>{t("CourseSettings.unpublishBody", { name: title })}</p>
            <p className="mds-caption">{t("CourseSettings.unpublishWay")}</p>
          </AlertDialog>
        </>
      ) : null}
    </section>
  );
}
