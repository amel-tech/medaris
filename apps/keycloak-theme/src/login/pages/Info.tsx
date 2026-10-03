import { AuthMessage } from "@medaris/ui/giris";
import { Html } from "../components/Html";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/** Keycloak messages that have a title of their own: [the message, the title's key]. */
const INFO_TITLES = [["emailVerifiedMessage", "emailVerifiedTitle"]] as const;

/**
 * `info.ftl` (canvas medaris/05 and 17): Keycloak's generic "something
 * happened" page: the e-mail was verified, the address changed, an action
 * link needs confirming. The title and the one sentence come from Keycloak's
 * message; the one way on is the first of `pageRedirectUri`, `actionUri` and
 * the client's `baseUrl`.
 */
export default function Info(
  props: ExtendedPageProps<Extract<KcContext, { pageId: "info.ftl" }>, I18n>
) {
  const { kcContext, i18n, Template, classes } = props;

  const { advancedMsgStr, msg, msgStr } = i18n;

  const {
    messageHeader,
    message,
    requiredActions,
    skipLink,
    pageRedirectUri,
    actionUri,
    client,
  } = kcContext;

  // Keycloak prints the same sentence as the title and again as the body when
  // it sends no `messageHeader`; the design has a title and one distinct
  // sentence. The one message the product words as both is the verified
  // e-mail: its sentence (this theme's own copy, which Keycloak serves back
  // server-side) becomes the body under its own title.
  const knownTitleKey = messageHeader
    ? undefined
    : INFO_TITLES.find(
        ([messageKey]) => message.summary === msgStr(messageKey)
      )?.[1];

  const title = messageHeader
    ? advancedMsgStr(messageHeader)
    : knownTitleKey !== undefined
      ? msgStr(knownTitleKey)
      : message.summary;

  const body = (() => {
    let html =
      messageHeader || knownTitleKey !== undefined
        ? (message.summary?.trim() ?? "")
        : "";

    if (requiredActions) {
      html += ` <b>${requiredActions
        .map((requiredAction) =>
          advancedMsgStr(`requiredAction.${requiredAction}`)
        )
        .join(", ")}</b>`;
    }

    return html.trim();
  })();

  const action = (() => {
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
      headerNode={<Html html={title} />}
    >
      <AuthMessage
        paragraphs={body ? [<Html key="body" html={body} />] : []}
        action={action ? { ...action, id: "kc-info-link" } : undefined}
      />
    </Template>
  );
}
