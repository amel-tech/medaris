import { Button } from "@medaris/ui/components/button";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import type { JSX } from "keycloakify/tools/JSX";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import { useState } from "react";
import {
  primaryButtonClassName,
  secondaryButtonClassName,
} from "../components/styles";
import type { I18n } from "../i18n";
import type { KcContext } from "../KcContext";
import type { ExtendedPageProps } from "../types/PageProps";

type LoginUpdateProfileProps = ExtendedPageProps<
  Extract<KcContext, { pageId: "login-update-profile.ftl" }>,
  I18n
> & {
  UserProfileFormFields: LazyOrNot<
    (props: UserProfileFormFieldsProps) => JSX.Element
  >;
  doMakeUserConfirmPassword: boolean;
};

/**
 * `login-update-profile.ftl` — the "Update Profile" required action, and what
 * a user whose profile misses a now-required attribute meets after sign-in.
 * Uses the same field renderer as Register. Placeholder layout until
 * MDRS-127's design.
 */
export default function LoginUpdateProfile(props: LoginUpdateProfileProps) {
  const {
    kcContext,
    i18n,
    doUseDefaultCss,
    Template,
    classes,
    UserProfileFormFields,
    doMakeUserConfirmPassword,
  } = props;

  const { kcClsx } = getKcClsx({ doUseDefaultCss, classes });

  const { messagesPerField, url, isAppInitiatedAction } = kcContext;

  const { msg, msgStr } = i18n;

  const [isFormSubmittable, setIsFormSubmittable] = useState(false);

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayRequiredFields
      headerNode={msg("loginProfileTitle")}
      displayMessage={messagesPerField.exists("global")}
    >
      <form
        id="kc-update-profile-form"
        action={url.loginAction}
        method="post"
        className="flex flex-col gap-5"
      >
        <UserProfileFormFields
          kcContext={kcContext}
          i18n={i18n}
          kcClsx={kcClsx}
          onIsFormSubmittableValueChange={setIsFormSubmittable}
          doMakeUserConfirmPassword={doMakeUserConfirmPassword}
        />
        <div id="kc-form-buttons" className="flex flex-col gap-3">
          <Button
            type="submit"
            disabled={!isFormSubmittable}
            className={primaryButtonClassName}
          >
            {msgStr("doSubmit")}
          </Button>
          {isAppInitiatedAction && (
            <Button
              type="submit"
              name="cancel-aia"
              value="true"
              formNoValidate
              variant="outline"
              className={secondaryButtonClassName}
            >
              {msg("doCancel")}
            </Button>
          )}
        </div>
      </form>
    </Template>
  );
}
