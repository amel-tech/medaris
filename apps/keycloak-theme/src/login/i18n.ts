import { i18nBuilder } from "keycloakify/login/i18n";
import type { ThemeName } from "../kc.gen";

/**
 * The theme's own copy, in the three languages the product ships (MDRS-100).
 *
 * Every key below is listed for all three languages — keycloakify's types
 * require it, and `test/i18n.spec.ts` checks that no key a page can show
 * falls back to English or to its raw name. Keys fall in two groups:
 *
 *   - keys Keycloak does not define at all (`loginAccountSubtitle`,
 *     `registerSubtitle`) — without them the page printed the key itself;
 *   - keys Keycloak defines but leaves untranslated in Turkish (roughly 200 of
 *     its 470 login messages have no `tr` entry, so they fell back to English),
 *     or words differently from the rest of the product (`doLogIn` is
 *     "Giriş yap" everywhere in `libs/i18n`, not Keycloak's "Oturum aç").
 *
 * The argument of `withCustomTranslations` must stay an inline object literal:
 * `keycloakify build` reads it statically from this file to write the
 * `messages_*.properties` Keycloak itself uses server-side, and silently skips
 * anything it cannot evaluate. No imports, spreads or `as const` inside it.
 *
 * A realm-level override of the four keys `vite.config.ts` lists still wins
 * over these (keycloakify resolves server messages first), so an operator can
 * change the copy without a release — but nothing depends on one existing.
 *
 * @see https://docs.keycloakify.dev/features/i18n
 */
const i18n = i18nBuilder
  .withThemeName<ThemeName>()
  .withCustomTranslations({
    en: {
      loginAccountTitle: "Sign in to your account",
      loginAccountSubtitle: "Pick up your lessons where you left off.",
      registerTitle: "Create your account",
      registerSubtitle:
        "Create your account, explore the köşks and join the lessons. Signing up is free.",
      doLogIn: "Sign in",
      doRegister: "Sign up",
      noAccount: "Don’t have an account?",
      "identity-provider-login-label": "Or sign in with",
      email: "E-mail",
      usernameOrEmail: "Username or e-mail",
      password: "Password",
      passwordNew: "New password",
      passwordConfirm: "Confirm password",
      showPassword: "Show password",
      hidePassword: "Hide password",
      rememberMe: "Remember me",
      doForgotPassword: "Forgot your password?",
      restartLoginTooltip: "Restart sign-in",
      doTryAnotherWay: "Try another way",
      requiredFields: "Required fields",
      acceptTerms: "I accept the terms of use",
      termsTitle: "Terms of use",
      termsText: "Please read and accept the terms of use to continue.",
      emailVerifyTitle: "Verify your e-mail address",
      emailVerifyInstruction1:
        "We have sent a verification link to {0}. Open it to activate your account.",
      emailVerifyInstruction2: "Didn’t get the e-mail?",
      emailForgotTitle: "Forgot your password?",
      emailInstruction:
        "Enter your username or e-mail address and we will send you a link to choose a new password.",
      emailInstructionUsername:
        "Enter your username and we will send you a link to choose a new password.",
      backToLogin: "Back to sign-in",
      backToApplication: "Back to the application",
      proceedWithAction: "Continue",
      updatePasswordTitle: "Choose a new password",
      logoutOtherSessions: "Sign out on my other devices",
      loginProfileTitle: "Complete your profile",
      pageExpiredTitle: "This page has expired",
      errorTitle: "Something went wrong",
      emailVerifyResend: "Send it again",
      doBack: "Back",
      emailVerifiedAlreadyMessage:
        "Your e-mail address has already been verified.",
      cookieNotFoundMessage:
        "Your browser blocked a cookie this page needs. Allow cookies for this site and try again.",
      termsAcceptanceRequired:
        "You need to accept the terms of use to continue.",
      invalidPasswordMaxLengthMessage:
        "Invalid password: at most {0} characters.",
      invalidPasswordNotEmailMessage:
        "Invalid password: it must not be your e-mail address.",
      "error-user-attribute-required": "Please fill in this field.",
      "error-invalid-length": "Length must be between {1} and {2}.",
      "error-invalid-length-too-short": "Must be at least {1} characters.",
      "error-invalid-length-too-long": "Must be at most {2} characters.",
      "error-invalid-email": "Invalid e-mail address.",
      "error-pattern-no-match": "Invalid value.",
      "error-invalid-value": "Invalid value.",
      "error-username-invalid-character":
        "The value contains an invalid character.",
      "error-person-name-invalid-character":
        "The value contains an invalid character.",
      "error-invalid-multivalued-size":
        "{0} must have at least {1} and at most {2} values.",
      "error-number-out-of-range": "The number must be between {1} and {2}.",
      "error-number-out-of-range-too-small": "The number must be at least {1}.",
      "error-number-out-of-range-too-big": "The number must be at most {2}.",
      "requiredAction.VERIFY_EMAIL": "Verify e-mail address",
      "requiredAction.UPDATE_PASSWORD": "Choose a new password",
      "requiredAction.UPDATE_PROFILE": "Complete your profile",
      "requiredAction.TERMS_AND_CONDITIONS": "Accept the terms of use",
    },
    tr: {
      loginAccountTitle: "Hesabınıza giriş yapın",
      loginAccountSubtitle: "Derslerinize kaldığınız yerden devam edin.",
      registerTitle: "Hesabınızı oluşturun",
      registerSubtitle:
        "Hesabınızı oluşturun, köşkleri keşfedin ve derslere katılın. Kayıt ücretsizdir.",
      doLogIn: "Giriş yap",
      doRegister: "Kayıt ol",
      noAccount: "Hesabınız yok mu?",
      "identity-provider-login-label": "Veya şununla giriş yapın",
      email: "E-posta",
      usernameOrEmail: "Kullanıcı adı veya e-posta",
      password: "Şifre",
      passwordNew: "Yeni şifre",
      passwordConfirm: "Şifre (tekrar)",
      showPassword: "Şifreyi göster",
      hidePassword: "Şifreyi gizle",
      rememberMe: "Beni hatırla",
      doForgotPassword: "Şifrenizi mi unuttunuz?",
      restartLoginTooltip: "Girişi yeniden başlat",
      doTryAnotherWay: "Başka bir yol dene",
      requiredFields: "Zorunlu alanlar",
      acceptTerms: "Kullanım koşullarını kabul ediyorum",
      termsTitle: "Kullanım koşulları",
      termsText:
        "Devam etmek için lütfen kullanım koşullarını okuyup kabul edin.",
      emailVerifyTitle: "E-posta adresinizi doğrulayın",
      emailVerifyInstruction1:
        "{0} adresine bir doğrulama bağlantısı gönderdik. Hesabınızı etkinleştirmek için bağlantıyı açın.",
      emailVerifyInstruction2: "E-posta gelmedi mi?",
      emailForgotTitle: "Şifrenizi mi unuttunuz?",
      emailInstruction:
        "Kullanıcı adınızı veya e-posta adresinizi girin; yeni şifre belirlemeniz için size bir bağlantı gönderelim.",
      emailInstructionUsername:
        "Kullanıcı adınızı girin; yeni şifre belirlemeniz için size bir bağlantı gönderelim.",
      backToLogin: "Girişe dön",
      backToApplication: "Uygulamaya dön",
      proceedWithAction: "Devam et",
      updatePasswordTitle: "Yeni şifrenizi belirleyin",
      logoutOtherSessions: "Diğer cihazlarımdaki oturumları kapat",
      loginProfileTitle: "Profilinizi tamamlayın",
      pageExpiredTitle: "Bu sayfanın süresi doldu",
      errorTitle: "Bir sorun oluştu",
      emailVerifyResend: "Yeniden gönder",
      doBack: "Geri",
      emailVerifiedAlreadyMessage: "E-posta adresiniz zaten doğrulanmış.",
      cookieNotFoundMessage:
        "Tarayıcınız bu sayfanın ihtiyaç duyduğu bir çerezi engelledi. Bu site için çerezlere izin verip yeniden deneyin.",
      termsAcceptanceRequired:
        "Devam etmek için kullanım koşullarını kabul etmelisiniz.",
      invalidPasswordMaxLengthMessage:
        "Geçersiz şifre: en fazla {0} karakter olabilir.",
      invalidPasswordNotEmailMessage:
        "Geçersiz şifre: e-posta adresinizle aynı olamaz.",
      "error-user-attribute-required": "Lütfen bu alanı doldurun.",
      "error-invalid-length": "Uzunluk {1} ile {2} arasında olmalıdır.",
      "error-invalid-length-too-short": "En az {1} karakter olmalıdır.",
      "error-invalid-length-too-long": "En fazla {2} karakter olmalıdır.",
      "error-invalid-email": "Geçersiz e-posta adresi.",
      "error-pattern-no-match": "Geçersiz değer.",
      "error-invalid-value": "Geçersiz değer.",
      "error-username-invalid-character":
        "Değer geçersiz bir karakter içeriyor.",
      "error-person-name-invalid-character":
        "Değer geçersiz bir karakter içeriyor.",
      "error-invalid-multivalued-size":
        "{0} en az {1}, en fazla {2} değer içermelidir.",
      "error-number-out-of-range": "Sayı {1} ile {2} arasında olmalıdır.",
      "error-number-out-of-range-too-small": "Sayı en az {1} olmalıdır.",
      "error-number-out-of-range-too-big": "Sayı en fazla {2} olmalıdır.",
      "requiredAction.VERIFY_EMAIL": "E-posta adresini doğrula",
      "requiredAction.UPDATE_PASSWORD": "Yeni şifre belirle",
      "requiredAction.UPDATE_PROFILE": "Profili tamamla",
      "requiredAction.TERMS_AND_CONDITIONS": "Kullanım koşullarını kabul et",
    },
    ar: {
      loginAccountTitle: "تسجيل الدخول إلى حسابك",
      loginAccountSubtitle: "تابع دروسك من حيث توقفت.",
      registerTitle: "أنشئ حسابك",
      registerSubtitle:
        "أنشئ حسابك، واستكشف الأكشاك، وانضم إلى الدروس. التسجيل مجاني.",
      doLogIn: "تسجيل الدخول",
      doRegister: "إنشاء حساب",
      noAccount: "ليس لديك حساب؟",
      "identity-provider-login-label": "أو سجّل الدخول باستخدام",
      email: "البريد الإلكتروني",
      usernameOrEmail: "اسم المستخدم أو البريد الإلكتروني",
      password: "كلمة المرور",
      passwordNew: "كلمة المرور الجديدة",
      passwordConfirm: "تأكيد كلمة المرور",
      showPassword: "إظهار كلمة المرور",
      hidePassword: "إخفاء كلمة المرور",
      rememberMe: "تذكرني",
      doForgotPassword: "نسيت كلمة المرور؟",
      restartLoginTooltip: "إعادة تسجيل الدخول",
      doTryAnotherWay: "المحاولة بطريقة أخرى",
      requiredFields: "الحقول المطلوبة",
      acceptTerms: "أوافق على شروط الاستخدام",
      termsTitle: "شروط الاستخدام",
      termsText: "يُرجى قراءة شروط الاستخدام والموافقة عليها للمتابعة.",
      emailVerifyTitle: "تحقّق من بريدك الإلكتروني",
      emailVerifyInstruction1:
        "أرسلنا رابط التحقق إلى {0}. افتحه لتفعيل حسابك.",
      emailVerifyInstruction2: "لم تصلك الرسالة؟",
      emailForgotTitle: "نسيت كلمة المرور؟",
      emailInstruction:
        "أدخل اسم المستخدم أو البريد الإلكتروني، وسنرسل إليك رابطًا لاختيار كلمة مرور جديدة.",
      emailInstructionUsername:
        "أدخل اسم المستخدم، وسنرسل إليك رابطًا لاختيار كلمة مرور جديدة.",
      backToLogin: "العودة إلى تسجيل الدخول",
      backToApplication: "العودة إلى التطبيق",
      proceedWithAction: "متابعة",
      updatePasswordTitle: "اختر كلمة مرور جديدة",
      logoutOtherSessions: "تسجيل الخروج من أجهزتي الأخرى",
      loginProfileTitle: "أكمل ملفك الشخصي",
      pageExpiredTitle: "انتهت صلاحية هذه الصفحة",
      errorTitle: "حدث خطأ ما",
      emailVerifyResend: "إعادة الإرسال",
      doBack: "رجوع",
      emailVerifiedAlreadyMessage: "تم التحقق من بريدك الإلكتروني مسبقًا.",
      cookieNotFoundMessage:
        "حظر متصفحك ملف تعريف ارتباط تحتاجه هذه الصفحة. اسمح بملفات تعريف الارتباط لهذا الموقع ثم حاول مجددًا.",
      termsAcceptanceRequired: "يجب الموافقة على شروط الاستخدام للمتابعة.",
      invalidPasswordMaxLengthMessage:
        "كلمة المرور غير صالحة: الحد الأقصى للطول {0}.",
      invalidPasswordNotEmailMessage:
        "كلمة المرور غير صالحة: يجب ألا تكون مطابقة للبريد الإلكتروني.",
      "error-user-attribute-required": "يرجى تعبئة هذا الحقل.",
      "error-invalid-length": "الطول يجب أن يكون بين {1} و {2}.",
      "error-invalid-length-too-short": "الطول يجب ألا يقل عن {1}.",
      "error-invalid-length-too-long": "الطول يجب ألا يزيد عن {2}.",
      "error-invalid-email": "بريد إلكتروني غير صالح.",
      "error-pattern-no-match": "قيمة غير صالحة.",
      "error-invalid-value": "قيمة غير صالحة.",
      "error-username-invalid-character": "القيمة تحتوي على حرف غير صالح.",
      "error-person-name-invalid-character": "القيمة تحتوي على حرف غير صالح.",
      "error-invalid-multivalued-size":
        "يجب أن يحتوي {0} على {1} قيمة على الأقل و{2} قيمة على الأكثر.",
      "error-number-out-of-range": "الرقم يجب أن يكون بين {1} و {2}.",
      "error-number-out-of-range-too-small": "الرقم يجب ألا تقل قيمته عن {1}.",
      "error-number-out-of-range-too-big": "الرقم يجب ألا تزيد قيمته عن {2}.",
      "requiredAction.VERIFY_EMAIL": "التحقق من البريد الإلكتروني",
      "requiredAction.UPDATE_PASSWORD": "اختيار كلمة مرور جديدة",
      "requiredAction.UPDATE_PROFILE": "إكمال الملف الشخصي",
      "requiredAction.TERMS_AND_CONDITIONS": "الموافقة على شروط الاستخدام",
    },
  })
  .build();
const { useI18n } = i18n;
type I18n = typeof i18n.ofTypeI18n;

export { useI18n, type I18n };
