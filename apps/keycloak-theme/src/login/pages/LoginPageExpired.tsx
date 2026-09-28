import { Button } from "@medaris/ui/components/button";
import {
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login-page-expired.ftl` — the sign-in or registration form sat open too
 * long, or the back button replayed it. Offers both ways out as buttons
 * instead of Keycloak's two "click here" sentences. Placeholder layout until
 * MDRS-127's design.
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
      headerNode={msg("pageExpiredTitle")}
    >
      <div className="flex flex-col gap-3">
        <Button asChild className={primaryButtonClassName}>
          <a id="loginRestartLink" href={url.loginRestartFlowUrl}>
            {msg("restartLoginTooltip")}
          </a>
        </Button>
        <Button asChild variant="outline" className={secondaryButtonClassName}>
          <a id="loginContinueLink" href={url.loginAction}>
            {msg("doContinue")}
          </a>
        </Button>
      </div>
    </Template>
  );
}
