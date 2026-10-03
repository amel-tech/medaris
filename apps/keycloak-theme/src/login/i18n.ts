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
 * `privacyNotice*` (MDRS-102) label the "Aydınlatma Metni’ni okudum" box that
 * `config/keycloak/user-profile.json` puts on the registration form; `{0}` in
 * `privacyNoticeRead` is where `UserProfileFormFields` places the link.
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
      loginAccountTitle: "Sign in",
      loginAccountSubtitle: "Pick up your lessons where you left off.",
      registerTitle: "Sign up",
      registerSubtitle:
        "Create your account, explore the köşks and apply to lessons.",
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
      requiredFields: "* required field",
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
      backToApplication: "Continue to Medaris",
      proceedWithAction: "Continue",
      updatePasswordTitle: "Choose a new password",
      logoutOtherSessions: "Sign out on my other devices",
      loginProfileTitle: "Complete your profile",
      pageExpiredTitle: "This page has expired",
      errorTitle: "Sign-in could not be completed",
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
      privacyNoticeTitle: "Your personal data",
      privacyNoticeRead: "I have read the {0}.",
      privacyNoticeLinkLabel: "Privacy Notice",
      loginSubmitting: "Signing in",
      formSubmitting: "Sending",
      haveAccount: "Already have an account?",
      emailVerifyHelp: "We will send the verification link to this address.",
      showPasswordConfirm: "Show the password you repeated",
      passwordNewConfirm: "Confirm new password",
      passwordRuleLength: "At least {0} characters",
      passwordRuleNotEmail: "Different from the e-mail address",
      passwordRuleNotUsername: "Different from the user name",
      passwordRuleMet: ", met",
      passwordTooShort:
        "The password is too short. Use at least {0} characters.",
      passwordRulesUnmet:
        "The password must differ from your e-mail address and user name.",
      passwordMismatch:
        "The passwords do not match. Type the same password again.",
      privacyNoticeRequired:
        "Confirm that you have read the notice to continue.",
      privacyNoticeNewTab: "Opens in a new tab.",
      updatePasswordForAccount: "Choose a new password for {0}.",
      updatePasswordForYou: "Choose a new password for your account.",
      updatePasswordSubmit: "Save password",
      logoutOtherSessionsHelp:
        "If your account stayed signed in on another device, you are signed out there too.",
      errorBody1: "Your sign-in was interrupted or is no longer valid.",
      errorBody2: "Go back to the sign-in page and try again from the start.",
      errorCookieBody1: "Your browser blocked a cookie that signing in needs.",
      errorCookieBody2:
        "Allow cookies for this site, then go back to the sign-in page and try again.",
      pageExpiredBody1:
        "The page stayed open for a long time or was reopened with the back button; it expired for security.",
      pageExpiredBody2:
        "Try again; if what you typed is gone, type it once more.",
      pageExpiredRetry: "Try again",
      logoutConfirmTitle: "Sign out?",
      logoutConfirmBody: "You will be signed out of Medaris in this browser.",
      logoutConfirmAction: "Sign out",
      logoutConfirmCancel: "Cancel",
      emailVerifiedMessage:
        "Your account is active. Explore the köşks and apply to lessons.",
      emailVerifiedTitle: "Your e-mail address is verified",
      username: "Username",
    },
    tr: {
      loginAccountTitle: "Giriş yap",
      loginAccountSubtitle: "Derslerine kaldığın yerden devam et.",
      registerTitle: "Kayıt ol",
      registerSubtitle: "Hesabını oluştur; köşkleri keşfet, derslere başvur.",
      doLogIn: "Giriş yap",
      doRegister: "Kayıt ol",
      noAccount: "Hesabın yok mu?",
      "identity-provider-login-label": "Veya şununla giriş yapın",
      email: "E-posta",
      usernameOrEmail: "Kullanıcı adı ya da e-posta",
      password: "Şifre",
      passwordNew: "Yeni şifre",
      passwordConfirm: "Şifre (tekrar)",
      showPassword: "Şifreyi göster",
      hidePassword: "Şifreyi gizle",
      rememberMe: "Beni hatırla",
      doForgotPassword: "Şifremi unuttum",
      restartLoginTooltip: "Girişi yeniden başlat",
      doTryAnotherWay: "Başka bir yol dene",
      requiredFields: "* zorunlu alan",
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
      backToLogin: "Giriş sayfasına dön",
      backToApplication: "Medaris’e devam et",
      proceedWithAction: "Devam et",
      updatePasswordTitle: "Yeni şifreni belirle",
      logoutOtherSessions: "Diğer cihazlarda çıkış yap",
      loginProfileTitle: "Profilinizi tamamlayın",
      pageExpiredTitle: "Bu sayfanın süresi doldu",
      errorTitle: "Giriş tamamlanamadı",
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
      privacyNoticeTitle: "Kişisel verileriniz",
      privacyNoticeRead: "{0}’ni okudum.",
      privacyNoticeLinkLabel: "Aydınlatma Metni",
      loginSubmitting: "Giriş yapılıyor",
      formSubmitting: "Gönderiliyor",
      haveAccount: "Hesabın var mı?",
      emailVerifyHelp: "Doğrulama bağlantısını bu adrese göndereceğiz.",
      showPasswordConfirm: "Tekrar yazdığın şifreyi göster",
      passwordNewConfirm: "Yeni şifre (tekrar)",
      passwordRuleLength: "En az {0} karakter",
      passwordRuleNotEmail: "E-posta adresinden farklı",
      passwordRuleNotUsername: "Kullanıcı adından farklı",
      passwordRuleMet: ", karşılandı",
      passwordTooShort: "Şifre çok kısa. En az {0} karakter kullan.",
      passwordRulesUnmet:
        "Şifren e-posta adresinden ve kullanıcı adından farklı olmalı.",
      passwordMismatch: "Şifreler eşleşmiyor. Aynı şifreyi yeniden yaz.",
      privacyNoticeRequired: "Devam etmek için metni okuduğunu onayla.",
      privacyNoticeNewTab: "Yeni sekmede açılır.",
      updatePasswordForAccount: "{0} hesabın için yeni bir şifre seç.",
      updatePasswordForYou: "Hesabın için yeni bir şifre seç.",
      updatePasswordSubmit: "Şifreyi kaydet",
      logoutOtherSessionsHelp:
        "Hesabın başka bir cihazda açık kaldıysa oradan da çıkılır.",
      errorBody1: "Giriş işlemin yarıda kaldı ya da geçersiz hâle geldi.",
      errorBody2: "Giriş sayfasına dönüp baştan dene.",
      errorCookieBody1:
        "Tarayıcın, girişin ihtiyaç duyduğu bir çerezi engelledi.",
      errorCookieBody2:
        "Bu site için çerezlere izin ver, sonra giriş sayfasına dönüp yeniden dene.",
      pageExpiredBody1:
        "Sayfa uzun süre açık kaldı ya da geri düğmesiyle yeniden açıldı; güvenlik gereği geçerliliğini yitirdi.",
      pageExpiredBody2:
        "Yeniden dene; yazdıkların silindiyse bir kez daha yaz.",
      pageExpiredRetry: "Yeniden dene",
      logoutConfirmTitle: "Çıkış yapılsın mı?",
      logoutConfirmBody: "Bu tarayıcıda Medaris’ten çıkarsın.",
      logoutConfirmAction: "Çıkış yap",
      logoutConfirmCancel: "Vazgeç",
      emailVerifiedMessage:
        "Hesabın etkinleşti. Köşkleri keşfedip derslere başvurabilirsin.",
      emailVerifiedTitle: "E-posta adresin doğrulandı",
      username: "Kullanıcı adı",
    },
    ar: {
      loginAccountTitle: "تسجيل الدخول",
      loginAccountSubtitle: "تابع دروسك من حيث توقفت.",
      registerTitle: "إنشاء حساب",
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
      requiredFields: "* حقل مطلوب",
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
      backToApplication: "المتابعة إلى مدارس",
      proceedWithAction: "متابعة",
      updatePasswordTitle: "اختر كلمة مرور جديدة",
      logoutOtherSessions: "تسجيل الخروج من أجهزتي الأخرى",
      loginProfileTitle: "أكمل ملفك الشخصي",
      pageExpiredTitle: "انتهت صلاحية هذه الصفحة",
      errorTitle: "تعذّر إكمال تسجيل الدخول",
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
      privacyNoticeTitle: "بياناتك الشخصية",
      privacyNoticeRead: "لقد قرأت {0}.",
      privacyNoticeLinkLabel: "إشعار الخصوصية",
      loginSubmitting: "جارٍ تسجيل الدخول",
      formSubmitting: "جارٍ الإرسال",
      haveAccount: "لديك حساب بالفعل؟",
      emailVerifyHelp: "سنرسل رابط التحقق إلى هذا العنوان.",
      showPasswordConfirm: "إظهار كلمة المرور المكررة",
      passwordNewConfirm: "تأكيد كلمة المرور الجديدة",
      passwordRuleLength: "{0} أحرف على الأقل",
      passwordRuleNotEmail: "تختلف عن البريد الإلكتروني",
      passwordRuleNotUsername: "تختلف عن اسم المستخدم",
      passwordRuleMet: "، تم استيفاؤه",
      passwordTooShort: "كلمة المرور قصيرة جدًا. استخدم {0} أحرف على الأقل.",
      passwordRulesUnmet:
        "يجب أن تختلف كلمة المرور عن بريدك الإلكتروني واسم المستخدم.",
      passwordMismatch:
        "كلمتا المرور غير متطابقتين. اكتب كلمة المرور نفسها مرة أخرى.",
      privacyNoticeRequired: "للمتابعة، أكّد أنك قرأت الإشعار.",
      privacyNoticeNewTab: "يفتح في علامة تبويب جديدة.",
      updatePasswordForAccount: "اختر كلمة مرور جديدة لحساب {0}.",
      updatePasswordForYou: "اختر كلمة مرور جديدة لحسابك.",
      updatePasswordSubmit: "حفظ كلمة المرور",
      logoutOtherSessionsHelp:
        "إذا بقي حسابك مفتوحًا على جهاز آخر فسيتم تسجيل الخروج منه أيضًا.",
      errorBody1: "توقفت عملية تسجيل الدخول أو لم تعد صالحة.",
      errorBody2: "عد إلى صفحة تسجيل الدخول وحاول من البداية.",
      errorCookieBody1: "حظر متصفحك ملف تعريف ارتباط يحتاجه تسجيل الدخول.",
      errorCookieBody2:
        "اسمح بملفات تعريف الارتباط لهذا الموقع، ثم عد إلى صفحة تسجيل الدخول وحاول مجددًا.",
      pageExpiredBody1:
        "بقيت الصفحة مفتوحة طويلًا أو أُعيد فتحها بزر الرجوع؛ فانتهت صلاحيتها لدواعٍ أمنية.",
      pageExpiredBody2: "حاول مجددًا؛ وإن اختفى ما كتبته فاكتبه مرة أخرى.",
      pageExpiredRetry: "حاول مجددًا",
      logoutConfirmTitle: "هل تريد تسجيل الخروج؟",
      logoutConfirmBody: "ستخرج من مدارس في هذا المتصفح.",
      logoutConfirmAction: "تسجيل الخروج",
      logoutConfirmCancel: "تراجع",
      emailVerifiedMessage: "تم تفعيل حسابك. استكشف الأكشاك وقدّم على الدروس.",
      emailVerifiedTitle: "تم التحقق من بريدك الإلكتروني",
      username: "اسم المستخدم",
    },
  })
  .build();
const { useI18n } = i18n;
type I18n = typeof i18n.ofTypeI18n;

export { useI18n, type I18n };
