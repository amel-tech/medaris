import { ConsentForm } from "@medaris/ui/giris";
import type { ReactNode } from "react";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login-oauth-grant.ftl`, the consent page: an app outside Medaris that
 * signs in with Medaris (a partner application, through its own confidential
 * client with consent required) asks once what it may see. The app's name, what it
 * asks for in the words of each scope's consent text (`${fullNameScopeConsentText}`
 * and `${genderScopeConsentText}` from `config/keycloak/client-scopes/`,
 * Keycloak's own for `email`…, all in `../i18n.ts`), the app's terms when its client
 * has them, and two answers posted with the one-time code: `accept` and
 * `cancel`, the names Keycloak reads.
 */
export default function LoginOauthGrant(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "login-oauth-grant.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, Template, classes } = props;

  const { url, oauth, client } = kcContext;

  const { msg, advancedMsg, advancedMsgStr } = i18n;

  const clientName = client.name
    ? advancedMsgStr(client.name)
    : client.clientId;

  // The client's own terms and privacy policy, when its settings link them.
  const links: { href: string; label: ReactNode }[] = [];
  for (const [href, label] of [
    [client.attributes.tosUri, msg("consentTerms")],
    [client.attributes.policyUri, msg("consentPolicy")],
  ] as const) {
    if (href !== undefined && /^https?:\/\//.test(href)) {
      links.push({ href, label });
    }
  }

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      bodyClassName="oauth"
      headerNode={msg("consentTitle", clientName)}
    >
      <ConsentForm
        action={url.oauthAction}
        code={{ name: "code", value: oauth.code }}
        lead={msg("consentLead", clientName)}
        scopes={oauth.clientScopesRequested.map((scope) => ({
          id: `${scope.consentScreenText}:${scope.dynamicScopeParameter ?? ""}`,
          text:
            scope.dynamicScopeParameter !== undefined ? (
              <>
                {advancedMsg(scope.consentScreenText)}:{" "}
                <bdi className="mds-mono">{scope.dynamicScopeParameter}</bdi>
              </>
            ) : (
              advancedMsg(scope.consentScreenText)
            ),
        }))}
        links={
          links.length > 0
            ? {
                intro: msg("consentLinksIntro", clientName),
                items: links,
                newTabNote: msg("privacyNoticeNewTab"),
              }
            : undefined
        }
        accept={{ name: "accept", label: msg("consentAccept") }}
        cancel={{ name: "cancel", label: msg("consentCancel") }}
      />
    </Template>
  );
}
