import { ArrowRightIcon, BookOpenIcon } from "@medaris/icons/ssr";
import type { KoskResponse, TaughtCourseRef } from "@medaris/services/tedrisat";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@medaris/ui/components/card";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { KoskCover } from "~/features/kosks/components/kosk-cover";
import { KoskFormDialog } from "~/features/kosks/components/kosk-form-dialog";
import type { KoskListEmptyState } from "~/features/kosks/kosk-abilities";
import { isKoskLevel } from "~/features/kosks/kosk-form";

/**
 * nizam's köşk list (MDRS-108): the köşks the caller manages
 * (`GET /kosks?managedBy=me`), then the courses they teach elsewhere. Every
 * card opens a page the caller may see; "Yeni Köşk" is SYSTEM_ADMIN's alone,
 * as `POST /kosks` is (`mayCreateKosk`).
 */
export async function KosksPage({
  kosks,
  page,
  totalPages,
  emptyState,
  taughtCourses,
  canCreateKosk,
}: {
  kosks: KoskResponse[];
  page: number;
  totalPages: number;
  emptyState: KoskListEmptyState;
  taughtCourses: TaughtCourseRef[];
  canCreateKosk: boolean;
}) {
  const t = await getTranslations("nizam");

  return (
    <div className="py-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">{t("KosksPage.title")}</h1>
          <p className="text-muted-foreground mt-2">
            {t("KosksPage.description")}
          </p>
        </div>
        {canCreateKosk && <KoskFormDialog />}
      </div>

      {kosks.length === 0 ? (
        <div className="text-center py-12 border-2 border-dashed rounded-lg bg-muted/30">
          <h3 className="text-lg font-medium text-muted-foreground">
            {emptyState === "nazir"
              ? t("KosksPage.nazirTitle")
              : t("KosksPage.emptyTitle")}
          </h3>
          <p className="text-sm text-muted-foreground/80 mt-1">
            {emptyState === "nazir"
              ? t("KosksPage.nazirDescription")
              : t("KosksPage.emptyDescription")}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {kosks.map((kosk) => (
            <Link
              key={kosk.id}
              href={`/kosks/${kosk.id}`}
              className="block group"
            >
              <Card className="h-full overflow-hidden pt-0 transition-all duration-300 hover:shadow-lg border-primary/10 hover:border-primary/30">
                <KoskCover hue={kosk.coverHue} className="h-20" />
                <CardHeader>
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                    <span className="flex items-center gap-2">
                      {kosk.field && (
                        <span className="font-semibold">{kosk.field}</span>
                      )}
                      {kosk.field && kosk.level && (
                        <span className="size-[3px] rounded-full bg-muted-foreground/50" />
                      )}
                      {kosk.level && (
                        <span>
                          {isKoskLevel(kosk.level)
                            ? t(`Levels.${kosk.level}`)
                            : kosk.level}
                        </span>
                      )}
                    </span>
                    <ArrowRightIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors opacity-0 group-hover:opacity-100 rtl:rotate-180" />
                  </div>
                  <CardTitle className="text-xl group-hover:text-primary transition-colors">
                    {kosk.name}
                  </CardTitle>
                  <CardDescription className="line-clamp-2">
                    {kosk.description ??
                      t("KosksPage.courseCount", {
                        count: kosk.courseCount ?? 0,
                      })}
                  </CardDescription>
                  {kosk.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {kosk.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-3 text-sm">
          {page > 1 ? (
            <Link
              href={`/kosks?page=${page - 1}`}
              className="rounded-lg border bg-background px-3.5 py-2 font-medium"
            >
              {t("KosksPage.previous")}
            </Link>
          ) : (
            <span className="rounded-lg border px-3.5 py-2 font-medium text-muted-foreground opacity-50">
              {t("KosksPage.previous")}
            </span>
          )}
          <span className="text-muted-foreground">
            {t("KosksPage.pageOf", { page, total: totalPages })}
          </span>
          {page < totalPages ? (
            <Link
              href={`/kosks?page=${page + 1}`}
              className="rounded-lg border bg-background px-3.5 py-2 font-medium"
            >
              {t("KosksPage.next")}
            </Link>
          ) : (
            <span className="rounded-lg border px-3.5 py-2 font-medium text-muted-foreground opacity-50">
              {t("KosksPage.next")}
            </span>
          )}
        </div>
      )}

      {taughtCourses.length > 0 && (
        <section className="mt-12">
          <h2 className="text-xl font-semibold">
            {t("KosksPage.taughtTitle")}
          </h2>
          <p className="text-sm text-muted-foreground mt-1 mb-4">
            {t("KosksPage.taughtDescription")}
          </p>
          <ul className="divide-y rounded-lg border">
            {taughtCourses.map((course) => (
              <li key={course.id}>
                <Link
                  href={`/kosks/${course.koskId}/courses/${course.id}/edit`}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-muted/40"
                >
                  <BookOpenIcon className="w-4 h-4 text-muted-foreground" />
                  <span className="flex-1 font-medium">{course.title}</span>
                  <ArrowRightIcon className="w-4 h-4 text-muted-foreground rtl:rotate-180" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
