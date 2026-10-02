import { UpdatePasswordForm } from "@medaris/ui/giris";
import { Html } from "../components/Html";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/** Stands in for the account while the message is cut around it. */
const ACCOUNT_SLOT = "\u0001";

/** "{0} hesabın için yeni bir şifre seç.": the account is set in mono, whatever order the language puts it in. */
function AccountSentence(props: { template: string; account: string }) {
  const [before = "", after = ""] = props.template.split(ACCOUNT_SLOT);
  return (
    <>
      {before}
      <bdi className="mds-mono" dir="ltr">
        {props.account}
      </bdi>
      {after}
    </>
  );
}

/**
 * `login-update-password.ftl` (canvas medaris/07): the second half of password
 * reset, the page the e-mailed link opens, and the "Update Password" required
 * action. Keycloak's template prints the account's user name here although
 * keycloakify's types do not declare it.
 */
export default function LoginUpdatePassword(
  props: ExtendedPageProps<
    Extract<KcContext, { pageId: "login-update-password.ftl" }>,
    I18n
  >
) {
  const { kcContext, i18n, Template, classes } = props;

  const { msg, msgStr } = i18n;

  const { url, messagesPerField, isAppInitiatedAction, auth } = kcContext;

  const account =
    (kcContext as { username?: string }).username ?? auth?.attemptedUsername;

  // Keycloak sends only the user name here. The e-mail rule compares against an
  // address the page really has: an `email` Keycloak did send, or a user name
  // that is itself an address; otherwise the server enforces `notEmail`.
  const knownEmail =
    (kcContext as { user?: { email?: string } }).user?.email ??
    (kcContext as { email?: string }).email ??
    (account?.includes("@") ? account : undefined);

  const fieldError = (name: string) =>
    messagesPerField.existsError(name) ? (
      <Html html={messagesPerField.get(name)} />
    ) : undefined;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayMessage={
        !messagesPerField.existsError("password", "password-confirm")
      }
      headerNode={msg("updatePasswordTitle")}
    >
      <p className="mds-body">
        {account ? (
          <AccountSentence
            template={msgStr("updatePasswordForAccount", ACCOUNT_SLOT)}
            account={account}
          />
        ) : (
          msg("updatePasswordForYou")
        )}
      </p>
      <UpdatePasswordForm
        action={url.loginAction}
        requiredNote={msg("requiredFields")}
        password={{
          name: "password-new",
          label: msg("passwordNew"),
          showLabel: msgStr("showPassword"),
          error: fieldError("password"),
        }}
        passwordConfirm={{
          name: "password-confirm",
          label: msg("passwordNewConfirm"),
          showLabel: msgStr("showPasswordConfirm"),
          error: fieldError("password-confirm"),
        }}
        email={knownEmail}
        username={account}
        ruleLabels={{
          length: msg("passwordRuleLength", "10"),
          notEmail: msg("passwordRuleNotEmail"),
          notUsername: msg("passwordRuleNotUsername"),
          met: msgStr("passwordRuleMet"),
        }}
        errors={{
          required: msg("error-user-attribute-required"),
          passwordTooShort: msg("passwordTooShort", "10"),
          passwordRules: msg("passwordRulesUnmet"),
          passwordMismatch: msg("passwordMismatch"),
        }}
        signOutOthers={{
          name: "logout-sessions",
          value: "on",
          label: msg("logoutOtherSessions"),
          description: msg("logoutOtherSessionsHelp"),
        }}
        submitLabel={msg("updatePasswordSubmit")}
        submittingLabel={msgStr("formSubmitting")}
        cancel={
          isAppInitiatedAction
            ? { name: "cancel-aia", value: "true", label: msg("doCancel") }
            : undefined
        }
      />
    </Template>
  );
}
