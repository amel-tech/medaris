import "./index.css";
import "@medaris/ui/globals.css";
import "@medaris/ui/medaris.css";
import "./giris.css";

import type { ClassKey } from "keycloakify/login";
import DefaultPage from "keycloakify/login/DefaultPage";
import { lazy, Suspense } from "react";
import { useI18n } from "./i18n";
import type { KcContext } from "./KcContext";
import ErrorPage from "./pages/ErrorPage";
import Info from "./pages/Info";
import Login from "./pages/Login";
import LoginPageExpired from "./pages/LoginPageExpired";
import LoginResetPassword from "./pages/LoginResetPassword";
import LoginUpdatePassword from "./pages/LoginUpdatePassword";
import LoginUpdateProfile from "./pages/LoginUpdateProfile";
import LoginVerifyEmail from "./pages/LoginVerifyEmail";
import LogoutConfirm from "./pages/LogoutConfirm";
import Register from "./pages/Register";
import Terms from "./pages/Terms";
import Template from "./Template";

const UserProfileFormFields = lazy(() => import("./UserProfileFormFields"));

const doMakeUserConfirmPassword = true;

/**
 * Every page a registrant can reach has its own component here (MDRS-100):
 * Login and Register, then — in the order a new user meets them — e-mail
 * verification, the info page the verification link ends on, the profile and
 * terms required actions, both halves of password reset, the expired-page and
 * error pages, and the sign-out confirmation. Login, Register, Info, the
 * update-password page, the error pages and the sign-out page are on the
 * unified design (MDRS-155, `@medaris/ui/giris`); the rest still draw their
 * bodies with the shadcn kit inside the same card. Anything else falls through to keycloakify's DefaultPage,
 * which loads Keycloak's stock PatternFly CSS on top of this theme's Template;
 * `test/pages.spec.tsx` fails if one of the pages above ever does.
 */

export default function KcPage(props: { kcContext: KcContext }) {
  const { kcContext } = props;

  const { i18n } = useI18n({ kcContext });

  return (
    <Suspense>
      {(() => {
        switch (kcContext.pageId) {
          case "login.ftl":
            return (
              <Login
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "register.ftl":
            return (
              <Register
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "login-verify-email.ftl":
            return (
              <LoginVerifyEmail
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "info.ftl":
            return (
              <Info
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "login-update-profile.ftl":
            return (
              <LoginUpdateProfile
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
                UserProfileFormFields={UserProfileFormFields}
                doMakeUserConfirmPassword={doMakeUserConfirmPassword}
              />
            );
          case "terms.ftl":
            return (
              <Terms
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "login-reset-password.ftl":
            return (
              <LoginResetPassword
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "login-update-password.ftl":
            return (
              <LoginUpdatePassword
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "login-page-expired.ftl":
            return (
              <LoginPageExpired
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "logout-confirm.ftl":
            return (
              <LogoutConfirm
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          case "error.ftl":
            return (
              <ErrorPage
                {...{ kcContext, i18n, classes }}
                Template={Template}
                doUseDefaultCss={false}
              />
            );
          default:
            return (
              <DefaultPage
                kcContext={kcContext}
                i18n={i18n}
                classes={classes}
                Template={Template}
                doUseDefaultCss={true}
                UserProfileFormFields={UserProfileFormFields}
                doMakeUserConfirmPassword={doMakeUserConfirmPassword}
              />
            );
        }
      })()}
    </Suspense>
  );
}

const classes = {} satisfies { [key in ClassKey]?: string };
