import { isSignedIn } from "~/features/courses/public-reads";
import { auth } from "~/lib/auth_options";
import { MemberPhoneMenu } from "./member-phone-menu";
import { PhoneMenu } from "./phone-menu";

/**
 * Below 768 the bar is the system's `AppBar`: the visitor's (design tedris/45)
 * or the signed-in talebe's (design tedris/44). The app's old header and tab
 * row step aside there so the page has one bar, not two.
 *
 * Mounted by the layouts of the segments that load the system's stylesheet
 * (`MedarisAssets`): the bar is drawn by that stylesheet and unstyled without it.
 */
export const PhoneChrome = async () => {
  const signedIn = await isSignedIn();
  const session = signedIn ? await auth() : null;
  return (
    <>
      <style>
        {
          "@media (max-width: 767.98px) { [data-legacy-header], [data-legacy-tabs] { display: none; } }"
        }
      </style>
      {signedIn ? (
        <MemberPhoneMenu name={session?.user?.name ?? ""} />
      ) : (
        <PhoneMenu />
      )}
    </>
  );
};
