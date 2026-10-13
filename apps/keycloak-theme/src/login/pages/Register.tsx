import { RegisterForm } from "@medaris/ui/giris";
import { Checkbox } from "@medaris/ui/mds/checkbox";
import { Field } from "@medaris/ui/mds/field";
import { Html } from "../components/Html";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import { withKcLocale } from "../locale-url";
import { profileFieldSpecs } from "../profile-fields";
import type { ExtendedPageProps } from "../types/PageProps";

type RegisterProps = ExtendedPageProps<
  Extract<KcContext, { pageId: "register.ftl" }>,
  I18n
>;

/**
 * `register.ftl` (canvas medaris/03). The form is the realm's user profile
 * (`config/keycloak/user-profile.json`): every attribute Keycloak serves for
 * registration is drawn by its input type, in the profile's order, marked
 * required when it is, with its help line and Keycloak's answer under it
 * (`../profile-fields.tsx`). An attribute added to the profile needs no change
 * here; `test/register-profile.spec.tsx` renders the realm's profile and fails
 * if one is missing.
 *
 * What the profile does not hold is the page's own: the password pair with
 * its live rules (Keycloak's `password` and `password-confirm`), placed after
 * the later of the user name and the e-mail so the rules that compare with
 * them read after both; the e-mail's help line; and the terms box when the
 * realm asks for it. `registrationEmailAsUsername` is off, so the user name
 * is its own field (canvas rule 44).
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

  const fields = profileFieldSpecs(Object.values(profile.attributesByName), {
    i18n,
    languageTag: kcContext.locale?.currentLanguageTag,
    messagesPerField,
    help: { email: msg("emailVerifyHelp") },
  });

  const passwordAfter = fields
    .filter((field) => field.name === "username" || field.name === "email")
    .at(-1)?.name;

  const minLength = passwordPolicies?.length ?? 10;

  const providerError = (name: string) =>
    messagesPerField.existsError(name) ? (
      <Html html={messagesPerField.get(name)} />
    ) : undefined;

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
          <a
            id="kc-login"
            href={withKcLocale(
              url.loginUrl,
              kcContext.locale?.currentLanguageTag
            )}
          >
            {msg("doLogIn")}
          </a>
        </>
      }
    >
      <RegisterForm
        action={url.registrationAction}
        requiredNote={msg("requiredFields")}
        fields={fields}
        passwordAfter={passwordAfter}
        password={{
          name: "password",
          label: msg("password"),
          showLabel: msgStr("showPassword"),
          error: providerError("password"),
        }}
        passwordConfirm={{
          name: "password-confirm",
          label: msg("passwordConfirm"),
          showLabel: msgStr("showPasswordConfirm"),
          error: providerError("password-confirm"),
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
          requiredChoice: msg("requiredChoice"),
          passwordTooShort: msg("passwordTooShort", String(minLength)),
          passwordRules: msg("passwordRulesUnmet"),
          passwordMismatch: msg("passwordMismatch"),
        }}
        submitLabel={msg("doRegister")}
        submittingLabel={msgStr("formSubmitting")}
      >
        {termsAcceptanceRequired ? (
          <Field error={providerError("termsAccepted")}>
            <Checkbox
              id="termsAccepted"
              name="termsAccepted"
              label={msg("acceptTerms")}
              description={msg("termsText")}
            />
          </Field>
        ) : null}
      </RegisterForm>
    </Template>
  );
}
