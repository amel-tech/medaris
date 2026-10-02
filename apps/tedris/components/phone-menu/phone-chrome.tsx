import { isSignedIn } from "~/features/courses/public-reads";
import { PhoneMenu } from "./phone-menu";

/**
 * Below 768 the signed-out visitor's bar is the system's `AppBar` (design
 * tedris/45), and the app's old header steps aside there so the page has one
 * bar, not two. A signed-in visitor keeps the old header until their own phone
 * menu lands (design tedris/44, a later package); this renders nothing for them.
 *
 * Mounted by the layouts of the segments that load the system's stylesheet
 * (`MedarisAssets`): the bar is drawn by that stylesheet and unstyled without it.
 */
export const PhoneChrome = async () => {
  if (await isSignedIn()) return null;
  return (
    <>
      <style>
        {
          "@media (max-width: 767.98px) { [data-legacy-header] { display: none; } }"
        }
      </style>
      <PhoneMenu />
    </>
  );
};
