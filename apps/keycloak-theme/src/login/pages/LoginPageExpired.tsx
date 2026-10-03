import { AuthMessage } from "@medaris/ui/giris";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login-page-expired.ftl` (canvas medaris/13): the sign-in or registration
 * form sat open too long, or the back button replayed it. One way on, which
 * starts the flow again; Keycloak's second link ("continue") resubmits a
 * stale form and is not offered.
 */
export default function LoginPageExpired(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "login-page-expired.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, Template, classes } = props;

  const { url } = kcContext;

  const { msg } = i18n;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={false}
      headerNode={msg("pageExpiredTitle")}
    >
      <AuthMessage
        paragraphs={[msg("pageExpiredBody1"), msg("pageExpiredBody2")]}
        action={{
          href: url.loginRestartFlowUrl,
          label: msg("pageExpiredRetry"),
          id: "loginRestartLink",
        }}
      />
    </Template>
  );
}
