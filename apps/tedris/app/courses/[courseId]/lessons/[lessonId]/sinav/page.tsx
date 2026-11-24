import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ExamTake } from "~/features/online-exams/components/exam-take";
import { readBriefing } from "~/features/online-exams/reads";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("tedrisLearn.OnlineExam");
  return { title: t("pageTitle") };
}

/**
 * An online exam's own page (MDRS-299, `graphs/tedris/exams/take`): from the
 * briefing to the end. The celse's layout has settled that the celse exists
 * for this caller; whether it is an online exam they may take is the
 * briefing's to say.
 */
export default async function Page({
  params,
}: {
  params: Promise<{ courseId: string; lessonId: string }>;
}) {
  const { courseId, lessonId } = await params;
  const t = await getTranslations("tedrisLearn.OnlineExam");
  const sessionHref = `/courses/${courseId}/lessons/${lessonId}`;
  const read = await readBriefing(lessonId);
  return (
    <main className="font-ui mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
      {read.status === "ok" ? (
        <ExamTake
          lessonId={lessonId}
          sessionHref={sessionHref}
          briefing={read.briefing}
        />
      ) : (
        <Alert
          tone={read.status === "absent" ? "neutral" : "error"}
          title={t(
            read.status === "absent" ? "notFoundTitle" : "loadFailedTitle"
          )}
        >
          <p>{t(read.status === "absent" ? "notFound" : "readFailed")}</p>
          <p>
            <Button variant="link" href={sessionHref}>
              {t("backToSession")}
            </Button>
          </p>
        </Alert>
      )}
    </main>
  );
}
