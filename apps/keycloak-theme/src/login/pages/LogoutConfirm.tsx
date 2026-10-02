import { LogoutConfirmForm } from "@medaris/ui/giris";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `logout-confirm.ftl` (canvas medaris/14), the fallback: the apps sign out
 * with a token hint (`keycloakSignOut`) and never land here. It posts the
 * one-time `session_code` back, and "Vazgeç" returns to the client.
 */
export default function LogoutConfirm(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "logout-confirm.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, Template, classes } = props;

  const { url, client, logoutConfirm } = kcContext;

  const { msg } = i18n;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={false}
      headerNode={msg("logoutConfirmTitle")}
      headerSubNode={msg("logoutConfirmBody")}
    >
      <LogoutConfirmForm
        action={url.logoutConfirmAction}
        confirmLabel={msg("logoutConfirmAction")}
        sessionCode={{ name: "session_code", value: logoutConfirm.code }}
        cancel={
          !logoutConfirm.skipLink && client.baseUrl
            ? { href: client.baseUrl, label: msg("logoutConfirmCancel") }
            : undefined
        }
      />
    </Template>
  );
}
