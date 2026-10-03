import { RegisterForm } from "@medaris/ui/giris";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Html } from "../components/Html";
import { privacyNoticeLabel } from "../components/privacyNoticeLabel";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

type RegisterProps = ExtendedPageProps<
  Extract<KcContext, { pageId: "register.ftl" }>,
  I18n
>;

/** The user-profile attributes this page draws, in the order the canvas lays them out. */
export const REGISTER_ATTRIBUTES = [
  "firstName",
  "lastName",
  "username",
  "email",
  "privacyNoticeRead",
] as const;

const PRIVACY_NEW_TAB_NOTE_ID = "privacy-notice-new-tab";

/**
 * `register.ftl` (canvas medaris/03). The realm's user profile declares exactly
 * the attributes in `REGISTER_ATTRIBUTES` (`test/register.spec.tsx` reads
 * `config/keycloak/user-profile.json` and fails if one is added without this
 * page drawing it), so the form is those fields and not a loop over whatever
 * the profile holds. Password and its repeat are Keycloak's `password` and
 * `password-confirm`; `registrationEmailAsUsername` is off, so the user name is
 * its own field (canvas rule 44).
 */
export default function Register(props: RegisterProps) {
  const { kcContext, i18n, Template, classes } = props;

  const {
    messageHeader,
    url,
    messagesPerField,
    termsAcceptanceRequired,
    profile,
    passwordPolicies,
  } = kcContext;

  const { msg, msgStr, advancedMsg } = i18n;

  const attribute = (name: (typeof REGISTER_ATTRIBUTES)[number]) =>
    profile.attributesByName[name];

  const text = (name: "firstName" | "lastName" | "username" | "email") => {
    const field = attribute(name);
    return {
      name,
      label: advancedMsg(field?.displayName ?? `\${${name}}`),
      defaultValue: field?.value ?? "",
      error: messagesPerField.existsError(name) ? (
        <Html html={messagesPerField.get(name)} />
      ) : undefined,
    };
  };

  const minLength = passwordPolicies?.length ?? 10;

  const privacy = attribute("privacyNoticeRead");
  const privacyOption = privacy?.annotations.inputOptionLabels
    ? (Object.keys(privacy.annotations.inputOptionLabels)[0] ?? "yes")
    : "yes";

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      headerNode={
        messageHeader !== undefined
          ? advancedMsg(messageHeader)
          : msg("registerTitle")
      }
      headerSubNode={
        messageHeader !== undefined
          ? undefined
          : advancedMsg("registerSubtitle")
      }
      displayMessage={messagesPerField.exists("global")}
      displayInfo
      infoNode={
        <>
          {msg("haveAccount")}{" "}
          <a id="kc-login" href={url.loginUrl}>
            {msg("doLogIn")}
          </a>
        </>
      }
    >
      <RegisterForm
        action={url.registrationAction}
        requiredNote={msg("requiredFields")}
        firstName={text("firstName")}
        lastName={text("lastName")}
        username={text("username")}
        email={{ ...text("email"), help: msg("emailVerifyHelp") }}
        password={{
          name: "password",
          label: msg("password"),
          showLabel: msgStr("showPassword"),
          error: messagesPerField.existsError("password") ? (
            <Html html={messagesPerField.get("password")} />
          ) : undefined,
        }}
        passwordConfirm={{
          name: "password-confirm",
          label: msg("passwordConfirm"),
          showLabel: msgStr("showPasswordConfirm"),
          error: messagesPerField.existsError("password-confirm") ? (
            <Html html={messagesPerField.get("password-confirm")} />
          ) : undefined,
        }}
        passwordMinLength={minLength}
        ruleLabels={{
          length: msg("passwordRuleLength", String(minLength)),
          notEmail: msg("passwordRuleNotEmail"),
          notUsername: msg("passwordRuleNotUsername"),
          met: msgStr("passwordRuleMet"),
        }}
        errors={{
          required: msg("error-user-attribute-required"),
          passwordTooShort: msg("passwordTooShort", String(minLength)),
          passwordRules: msg("passwordRulesUnmet"),
          passwordMismatch: msg("passwordMismatch"),
          privacy: msg("privacyNoticeRequired"),
        }}
        privacy={{
          name: "privacyNoticeRead",
          id: `privacyNoticeRead-${privacyOption}`,
          value: privacyOption,
          label: privacy
            ? privacyNoticeLabel(
                i18n,
                privacy,
                privacyOption,
                PRIVACY_NEW_TAB_NOTE_ID
              )
            : msg("privacyNoticeTitle"),
          newTabNote: msg("privacyNoticeNewTab"),
          newTabNoteId: PRIVACY_NEW_TAB_NOTE_ID,
          error: messagesPerField.existsError("privacyNoticeRead") ? (
            <Html html={messagesPerField.get("privacyNoticeRead")} />
          ) : undefined,
          defaultChecked: privacy?.values?.includes(privacyOption) ?? false,
        }}
        submitLabel={msg("doRegister")}
        submittingLabel={msgStr("formSubmitting")}
      >
        {termsAcceptanceRequired ? (
          <Checkbox
            id="termsAccepted"
            name="termsAccepted"
            label={msg("acceptTerms")}
            description={msg("termsText")}
          />
        ) : null}
      </RegisterForm>
    </Template>
  );
}
