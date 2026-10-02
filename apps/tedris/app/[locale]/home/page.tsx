import { getTranslations } from "next-intl/server";
import { Suspense } from "react";
import { isSignedIn } from "~/features/courses/public-reads";
import {
  ContinueSection,
  DecksSection,
  FollowedSection,
  SectionSkeleton,
} from "~/features/home/components/home-sections";
import { HomeSessions } from "~/features/schedule/components/home-sessions";
import { getMyUpcomingLessons } from "~/features/schedule/reads";
import { auth } from "~/lib/auth_options";

// Open to a visitor and different for a signed-in caller.
export const dynamic = "force-dynamic";

/**
 * Ana sayfa (design tedris/01): the greeting and the sessions, then the three
 * sections that each read for themselves, so one that fails or is slow does not
 * hold back the rest (MDRS-165).
 */
export default async function Home() {
  if (!(await isSignedIn())) {
    const t = await getTranslations("tedris");
    return (
      <main className="mx-auto w-full max-w-[80rem] py-2 grow-1">
        {t("TabView.home")}
      </main>
    );
  }
  const [session, sessions, learn] = await Promise.all([
    auth(),
    getMyUpcomingLessons(4),
    getTranslations("tedrisLearn"),
  ]);
  return (
    <HomeSessions
      name={session?.user?.name ?? ""}
      sessions={sessions}
      now={new Date()}
    >
      <Suspense
        fallback={
          <SectionSkeleton columns={3} label={learn("Home.continueTitle")} />
        }
      >
        <ContinueSection />
      </Suspense>
      <div className="grid items-start gap-x-8 gap-y-10 grid-cols-[minmax(0,5fr)_minmax(0,4fr)] max-md:grid-cols-1">
        <Suspense
          fallback={<SectionSkeleton label={learn("Home.decksTitle")} />}
        >
          <DecksSection />
        </Suspense>
        <Suspense
          fallback={<SectionSkeleton label={learn("Home.followedTitle")} />}
        >
          <FollowedSection />
        </Suspense>
      </div>
    </HomeSessions>
  );
}
