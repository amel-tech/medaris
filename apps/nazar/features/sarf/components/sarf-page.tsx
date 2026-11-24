import {
  CODES,
  holds,
  PAGE_CODES,
  pageGate,
  readCoursePermissions,
} from "~/features/account/course-permissions";
import { PageProblem } from "~/features/shell/components/page-problem";
import { getMessages } from "~/lib/i18n/messages";
import { readOnce } from "~/lib/tedrisat-read";
import { sarfRootFacts } from "../sarf";
import { type SarfDeckOption, SarfScreen } from "./sarf-screen";

/**
 * Sarf tablosu of a course: "kök ver", and the Emsile's tables come out of the
 * engine. The page opens for `course.edit` in the course, read from
 * `GET /courses/:id/my-permissions`; anyone else gets "Bu sayfaya izniniz
 * yok". The decks to add cards to are offered only to who manages them.
 */
export async function SarfPage({ courseId }: { courseId: string }) {
  const [t, permissions, roots] = await Promise.all([
    getMessages("nazar.Sarf"),
    readCoursePermissions(courseId),
    readOnce("the course's sarf roots", (api) =>
      api.courses.listCourseSarfRoots({ id: courseId })
    ),
  ]);
  const gate = pageGate([roots], permissions, PAGE_CODES.sarf);
  if (gate !== "ok" || roots.status !== "ok" || permissions.status !== "ok") {
    return (
      <>
        <h1 className="mds-h1">{t("title")}</h1>
        <PageProblem
          status={gate === "forbidden" ? "forbidden" : "failed"}
          failed={{ title: t("loadFailedTitle"), text: t("loadFailed") }}
        />
      </>
    );
  }
  // A read that fails here only hides "Desteye ekle"; the tables do not need it.
  const decks = holds(permissions.data, CODES.deckManageCourse)
    ? await readOnce("the course's decks", (api) =>
        api.courses.getCourseDecksManage({ id: courseId })
      )
    : null;
  const options: SarfDeckOption[] =
    decks?.status === "ok"
      ? decks.data.map((deck) => ({
          id: deck.id,
          title: deck.title,
          cardType: deck.cardType,
        }))
      : [];

  return (
    <>
      <header className="flex max-inline-measure flex-col gap-1">
        <h1 className="mds-h1">{t("title")}</h1>
        <p className="mds-body-sm text-neutral-muted">{t("summary")}</p>
      </header>
      <SarfScreen
        courseId={courseId}
        roots={sarfRootFacts(roots.data)}
        decks={options}
      />
    </>
  );
}
