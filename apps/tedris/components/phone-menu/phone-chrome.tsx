import { isSignedIn } from "~/features/courses/public-reads";
import { auth } from "~/lib/auth_options";
import { DesktopBar } from "./desktop-bar";
import { MemberPhoneMenu, type Section } from "./member-phone-menu";
import { PhoneMenu } from "./phone-menu";

/**
 * The system's chrome: at 768 and up the top bar every Tedris screen draws,
 * below 768 the `AppBar` — the visitor's (design tedris/45) or the signed-in
 * talebe's (design tedris/44). The app's old header and tab row step aside at
 * every width, so the page has one bar, not two.
 *
 * Mounted by the layouts of the segments that are on the system. Both bars are
 * drawn by the system's stylesheet, which every page has since it became part
 * of the app's one stylesheet (app/tedris.css, MDRS-281).
 *
 * `section` and `title` are for the pages whose place and name the address
 * cannot tell: a course page is Derslerim's for its talebe and Keşfet's for
 * everyone else, and its phone bar carries the course's title.
 */
export const PhoneChrome = async ({
  section,
  title,
}: {
  section?: Section;
  title?: string;
} = {}) => {
  const signedIn = await isSignedIn();
  const session = signedIn ? await auth() : null;
  const name = session?.user?.name ?? "";
  return (
    <>
      {/* A page drawn inside the shell's legacy wrapper (the not-found page)
          gets the full width back, so the bar spans the window. */}
      <style>
        {
          "[data-legacy-header], [data-legacy-tabs] { display: none; } [data-legacy-main]:has([data-system-chrome]) { max-inline-size: none; margin: 0; padding: 0; }"
        }
      </style>
      <DesktopBar signedIn={signedIn} name={name} section={section} />
      {signedIn ? (
        <MemberPhoneMenu name={name} section={section} title={title} />
      ) : (
        <PhoneMenu title={title} />
      )}
    </>
  );
};
