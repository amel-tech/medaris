import { Button } from "@medaris/ui/mds/button";
import { getKcClsx } from "keycloakify/login/lib/kcClsx";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import type { JSX } from "keycloakify/tools/JSX";
import type { LazyOrNot } from "keycloakify/tools/LazyOrNot";
import { useState } from "react";
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
 * `login-update-profile.ftl` (canvas medaris/10, "Profilini tamamla"): what a
 * signed-in user meets when the realm's profile has a required attribute they
 * lack — every account made before `gender` became required lands here once —
 * and the "Update Profile" required action. The fields are the realm's
 * profile, drawn like the registration form's (`UserProfileFormFields`);
 * "Kaydet ve devam et" waits until keycloakify's checks pass, as it always
 * has here (MDRS-257). An app that sent the user here on purpose gets
 * "Vazgeç" too, and no sentence about missing details.
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

  const { msg } = i18n;

  const [isFormSubmittable, setIsFormSubmittable] = useState(false);

  return (
    <Template
      kcContext={kcContext}
      i18n={i18n}
      doUseDefaultCss={false}
      classes={classes}
      displayRequiredFields
      headerNode={msg("loginProfileTitle")}
      headerSubNode={
        isAppInitiatedAction ? undefined : msg("loginProfileSubtitle")
      }
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
        <div id="kc-form-buttons" className="flex flex-col gap-2">
          <Button
            type="submit"
            size="large"
            fullWidth
            disabled={!isFormSubmittable}
          >
            {msg("updateProfileSubmit")}
          </Button>
          {isAppInitiatedAction && (
            <Button
              type="submit"
              name="cancel-aia"
              value="true"
              formNoValidate
              variant="ghost"
              size="large"
              fullWidth
            >
              {msg("doCancel")}
            </Button>
          )}
        </div>
      </form>
    </Template>
  );
}
