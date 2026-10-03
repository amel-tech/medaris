import { textFontsHref } from "@medaris/tokens/medaris-fonts";
import { AuthCard } from "@medaris/ui/giris";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import { useInitialize } from "keycloakify/login/Template.useInitialize";
import { useSetClassName } from "keycloakify/tools/useSetClassName";
import { useEffect } from "react";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";
import type { ExtendedTemplateProps } from "./types/TemplateProps";

const ALERT_TONE = {
  error: "error",
  success: "success",
  warning: "warning",
  info: "info",
} as const;

/**
 * The shell of every sign-in page: the document's title and `<html>` class,
 * Keycloak's own initialisation, and `AuthCard` from `@medaris/ui/giris` for
 * everything visible (canvas medaris/01..14, rule 44). Keycloak's message
 * becomes an `Alert` in the card; the "try another way" form and the social
 * providers sit under the page's own content.
 */
export default function Template(
  props: ExtendedTemplateProps<KcContext, I18n>
) {
  const {
    displayInfo = false,
    displayMessage = true,
    displayRequiredFields = false,
    headerNode,
    headerSubNode,
    alertNode,
    socialProvidersNode = null,
    infoNode = null,
    documentTitle,
    bodyClassName,
    kcContext,
    i18n,
    doUseDefaultCss,
    classes,
    children,
  } = props;

  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });

  const { msg, msgStr } = i18n;

  const { realm, auth, url, message, isAppInitiatedAction } = kcContext;

  useEffect(() => {
    document.title = documentTitle ?? msgStr("loginTitle", realm.displayName);
  }, [documentTitle, msgStr, realm.displayName]);

  useSetClassName({
    qualifiedName: "html",
    className: kcClsx("kcHtmlClass"),
  });

  useSetClassName({
    qualifiedName: "body",
    className: bodyClassName ?? kcClsx("kcBodyClass"),
  });

  const { isReadyToRender } = useInitialize({ kcContext, doUseDefaultCss });

  if (!isReadyToRender) {
    return null;
  }

  const showAttemptedUsername =
    auth?.showUsername && !auth.showResetCredentials;

  // App-initiated actions should not see warning messages about the need to
  // complete the action during login.
  const alert =
    alertNode ??
    (displayMessage &&
    message !== undefined &&
    (message.type !== "warning" || !isAppInitiatedAction) ? (
      <Alert
        tone={ALERT_TONE[message.type]}
        title={
          <span
            dangerouslySetInnerHTML={{ __html: kcSanitize(message.summary) }}
          />
        }
      />
    ) : undefined);

  return (
    <>
      {/* The faces load from a <link> with preconnect, not an @import in the
          stylesheet (canvas rule 39); React puts them in the document head. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link rel="stylesheet" href={textFontsHref} precedence="default" />
      <AuthCard
        title={headerNode}
        subtitle={
          headerSubNode ??
          (showAttemptedUsername ? (
            <>
              <bdi className="mds-mono" dir="ltr" id="kc-attempted-username">
                {auth.attemptedUsername}
              </bdi>{" "}
              <a id="reset-login" href={url.loginRestartFlowUrl}>
                {msg("restartLoginTooltip")}
              </a>
            </>
          ) : undefined)
        }
        alert={alert}
        footer={displayInfo ? infoNode : undefined}
      >
        {displayRequiredFields ? (
          <p className="mds-caption">{msg("requiredFields")}</p>
        ) : null}

        {children}

        {auth?.showTryAnotherWayLink ? (
          <form
            id="kc-select-try-another-way-form"
            action={url.loginAction}
            method="post"
          >
            <input type="hidden" name="tryAnotherWay" value="on" />
            <Button type="submit" variant="ghost" fullWidth>
              {msg("doTryAnotherWay")}
            </Button>
          </form>
        ) : null}

        {socialProvidersNode}
      </AuthCard>
    </>
  );
}
