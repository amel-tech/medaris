import { AuthMessage } from "@medaris/ui/giris";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `error.ftl` (canvas medaris/12), named ErrorPage so it does not shadow the
 * global `Error`. Whatever stopped the sign-in, the person is told that it did
 * not finish and is sent to the start of it; a blocked cookie, the one cause
 * the canvas words differently, gets its own sentences. The raw message is
 * Keycloak's internal wording and is not shown. The way back is the client's
 * `baseUrl` first: the app starts a fresh sign-in, while `loginRestartFlowUrl`
 * answers 400 when the browser holds no auth session (bad redirect_uri,
 * unknown client, a used e-mail link), which is the usual cause of this page.
 */
export default function ErrorPage(
  props: ExtendedPageProps<Extract<KcContext, { pageId: "error.ftl" }>, I18n>
) {
  const { kcContext, i18n, Template, classes } = props;

  const { message, client, url, skipLink } = kcContext;

  const { msg, msgStr } = i18n;

  const cookieBlocked = message.summary === msgStr("cookieNotFoundMessage");

  const href = client?.baseUrl || url.loginRestartFlowUrl;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={false}
      headerNode={msg("errorTitle")}
    >
      <div id="kc-error-message" className="contents">
        <AuthMessage
          paragraphs={
            cookieBlocked
              ? [msg("errorCookieBody1"), msg("errorCookieBody2")]
              : [msg("errorBody1"), msg("errorBody2")]
          }
          action={
            !skipLink && href
              ? { href, label: msg("backToLogin"), id: "backToApplication" }
              : undefined
          }
        />
      </div>
    </Template>
  );
}
