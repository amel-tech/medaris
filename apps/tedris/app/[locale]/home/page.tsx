import { getTranslations } from "next-intl/server";
import { isSignedIn } from "~/features/courses/public-reads";
import { HomeSessions } from "~/features/schedule/components/home-sessions";
import { getMyUpcomingLessons } from "~/features/schedule/reads";
import { auth } from "~/lib/auth_options";

// Open to a visitor and different for a signed-in caller.
export const dynamic = "force-dynamic";

export default async function Home() {
  if (!(await isSignedIn())) {
    const t = await getTranslations("tedris");
    return <div>{t("TabView.home")}</div>;
  }
  const session = await auth();
  const sessions = await getMyUpcomingLessons(4);
  return (
    <HomeSessions
      name={session?.user?.name ?? ""}
      sessions={sessions}
      now={new Date()}
    />
  );
}
