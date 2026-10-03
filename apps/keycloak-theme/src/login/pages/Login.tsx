import { LoginForm } from "@medaris/ui/giris";
import { Alert } from "@medaris/ui/mds/alert";
import { Button } from "@medaris/ui/mds/button";
import { kcSanitize } from "keycloakify/lib/kcSanitize";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

/**
 * `login.ftl` (canvas medaris/01). Everything Keycloak-specific is read here
 * and handed to `LoginForm` as plain props: the form never sees `kcContext`.
 */
export default function Login(
  props: ExtendedPageProps<Extract<KcContext, { pageId: "login.ftl" }>, I18n>
) {
  const { kcContext, i18n, Template, classes } = props;

  const {
    social,
    realm,
    url,
    usernameHidden,
    login,
    auth,
    registrationDisabled,
    messagesPerField,
    message,
  } = kcContext;

  const { msg, msgStr, advancedMsg } = i18n;

  const showRegister =
    realm.password && realm.registrationAllowed && !registrationDisabled;

  const credentialError = messagesPerField.existsError("username", "password");

  // Keycloak sends its reason as `message`; without one, the field's own error
  // is the reason. Either way it is one Alert at the top, and both fields are
  // marked invalid, as the canvas has it.
  const alertNode = credentialError ? (
    <Alert
      tone="error"
      title={
        <span
          dangerouslySetInnerHTML={{
            __html: kcSanitize(
              message?.type === "error"
                ? message.summary
                : messagesPerField.getFirstError("username", "password")
            ),
          }}
        />
      }
    />
  ) : undefined;

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      alertNode={alertNode}
      displayMessage={!credentialError}
      headerNode={advancedMsg("loginAccountTitle")}
      headerSubNode={advancedMsg("loginAccountSubtitle")}
      displayInfo={showRegister}
      infoNode={
        <>
          {msg("noAccount")}{" "}
          <a id="kc-registration" href={url.registrationUrl}>
            {msg("doRegister")}
          </a>
        </>
      }
    >
      {realm.password ? (
        <LoginForm
          action={url.loginAction}
          requiredNote={msg("requiredFields")}
          usernameLabel={
            !realm.loginWithEmailAllowed
              ? msg("username")
              : !realm.registrationEmailAsUsername
                ? msg("usernameOrEmail")
                : msg("email")
          }
          passwordLabel={msg("password")}
          showPasswordLabel={msgStr("showPassword")}
          username={login.username ?? ""}
          usernameHidden={usernameHidden}
          invalid={credentialError}
          forgotPassword={
            realm.resetPasswordAllowed
              ? {
                  href: url.loginResetCredentialsUrl,
                  label: msg("doForgotPassword"),
                }
              : undefined
          }
          rememberMe={
            realm.rememberMe && !usernameHidden
              ? {
                  name: "rememberMe",
                  label: msg("rememberMe"),
                  defaultChecked: !!login.rememberMe,
                }
              : undefined
          }
          submitLabel={msg("doLogIn")}
          submittingLabel={msgStr("loginSubmitting")}
        >
          <input
            type="hidden"
            id="id-hidden-input"
            name="credentialId"
            value={auth.selectedCredential}
          />
        </LoginForm>
      ) : null}

      {realm.password &&
      social?.providers !== undefined &&
      social.providers.length !== 0 ? (
        <div id="kc-social-providers" className="flex flex-col gap-3">
          <p className="mds-caption">{msg("identity-provider-login-label")}</p>
          <ul className="flex flex-col gap-2">
            {social.providers.map((provider) => (
              <li key={provider.alias}>
                <Button
                  href={provider.loginUrl}
                  id={`social-${provider.alias}`}
                  variant="outline"
                  fullWidth
                >
                  <span
                    dangerouslySetInnerHTML={{
                      __html: kcSanitize(provider.displayName),
                    }}
                  />
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Template>
  );
}
