import { Button } from "@medaris/ui/components/button";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import { primaryButtonClassName } from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `info.ftl` — Keycloak's generic "something happened" page: the e-mail was
 * verified, the password was changed, an action link needs confirming.
 * Placeholder layout until MDRS-127's design.
 */
export default function Info(
  props: ExtendedPageProps<Extract<KcContext, { pageId: "info.ftl" }>, I18n>
) {
  const { kcContext, i18n, Template, classes } = props;

  const { advancedMsgStr, msg } = i18n;

  const {
    messageHeader,
    message,
    requiredActions,
    skipLink,
    pageRedirectUri,
    actionUri,
    client,
  } = kcContext;

  const summary = (() => {
    let html = message.summary?.trim() ?? "";

    if (requiredActions) {
      html += ` <b>${requiredActions
        .map((requiredAction) =>
          advancedMsgStr(`requiredAction.${requiredAction}`)
        )
        .join(", ")}</b>`;
    }

    return html;
  })();

  const link = (() => {
    if (skipLink) {
      return undefined;
    }
    if (pageRedirectUri) {
      return { href: pageRedirectUri, label: msg("backToApplication") };
    }
    if (actionUri) {
      return { href: actionUri, label: msg("proceedWithAction") };
    }
    if (client.baseUrl) {
      return { href: client.baseUrl, label: msg("backToApplication") };
    }
    return undefined;
  })();

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={false}
      headerNode={
        <span
          dangerouslySetInnerHTML={{
            __html: kcSanitize(
              messageHeader ? advancedMsgStr(messageHeader) : message.summary
            ),
          }}
        />
      }
    >
      <div id="kc-info-message" className="flex flex-col gap-6">
        <p
          className="text-center text-gray-700"
          dangerouslySetInnerHTML={{ __html: kcSanitize(summary) }}
        />
        {link !== undefined && (
          <Button asChild className={primaryButtonClassName}>
            <a id="kc-info-link" href={link.href}>
              {link.label}
            </a>
          </Button>
        )}
      </div>
    </Template>
  );
}
