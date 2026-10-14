import { ProfileFields, type ProfileFieldValue } from "@medaris/ui/giris";
import { useUserProfileForm } from "keycloakify/login/lib/useUserProfileForm";
import type { UserProfileFormFieldsProps } from "keycloakify/login/UserProfileFormFieldsProps";
import { useEffect } from "react";
import type { I18n } from "./i18n";
import type { KcContext } from "./KcContext";
import { profileFieldSpecs } from "./profile-fields";

/**
 * The user-profile fields of the pages keycloakify drives: the profile page
 * (`login-update-profile.ftl`, canvas medaris/10, where a signed-in user lands
 * when the realm's profile gains a required attribute they lack, such as
 * `gender`), and the pages left to keycloakify's `DefaultPage`
 * (`idp-review-user-profile.ftl`, `update-email.ftl`).
 *
 * keycloakify's `useUserProfileForm` holds the values and checks them as the
 * user types, as Keycloak's own template does; the fields are drawn by
 * `@medaris/ui/giris` from the same specs as the registration form
 * (`./profile-fields.tsx`), so both pages look alike and follow the realm's
 * profile without a change here.
 */
export default function UserProfileFormFields(
  props: UserProfileFormFieldsProps<KcContext, I18n>
) {
  const {
    kcContext,
    i18n,
    kcClsx,
    onIsFormSubmittableValueChange,
    doMakeUserConfirmPassword,
    BeforeField,
    AfterField,
  } = props;

  const {
    formState: { formFieldStates, isFormSubmittable },
    dispatchFormAction,
  } = useUserProfileForm({
    kcContext,
    i18n,
    doMakeUserConfirmPassword,
  });

  useEffect(() => {
    onIsFormSubmittableValueChange(isFormSubmittable);
  }, [isFormSubmittable, onIsFormSubmittableValueChange]);

  const states = new Map(
    formFieldStates.map((state) => [state.attribute.name, state])
  );

  const fields = profileFieldSpecs(
    formFieldStates.map((state) => state.attribute),
    { i18n, languageTag: kcContext.locale?.currentLanguageTag }
  );

  const slot = (Slot: typeof BeforeField) => (spec: { name: string }) => {
    const state = states.get(spec.name);
    return Slot !== undefined && state !== undefined ? (
      <Slot
        attribute={state.attribute}
        dispatchFormAction={dispatchFormAction}
        displayableErrors={state.displayableErrors}
        valueOrValues={state.valueOrValues}
        kcClsx={kcClsx}
        i18n={i18n}
      />
    ) : null;
  };

  return (
    <ProfileFields
      fields={fields}
      values={Object.fromEntries(
        formFieldStates.map((state) => [
          state.attribute.name,
          state.valueOrValues,
        ])
      )}
      // One reason per field, as the design system writes it: the first.
      errors={Object.fromEntries(
        formFieldStates.map((state) => [
          state.attribute.name,
          state.displayableErrors[0]?.errorMessage,
        ])
      )}
      onChange={(name, value: ProfileFieldValue) => {
        // keycloakify holds a multivalued attribute as a list; one field of it
        // still answers with a list.
        const current = states.get(name)?.valueOrValues;
        dispatchFormAction({
          action: "update",
          name,
          valueOrValues:
            Array.isArray(current) && typeof value === "string"
              ? [value]
              : value,
        });
      }}
      onBlur={(name) =>
        dispatchFormAction({
          action: "focus lost",
          name,
          fieldIndex: undefined,
        })
      }
      before={BeforeField === undefined ? undefined : slot(BeforeField)}
      after={AfterField === undefined ? undefined : slot(AfterField)}
    />
  );
}
