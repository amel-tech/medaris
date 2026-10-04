// What Medaris stores in a browser, for the Çerezler page. Measured from the
// code on 4 October (main together with the open pull requests): NextAuth 4's
// cookies in apps/*/lib/auth_cookies.ts, Keycloak 26's own cookies with the
// realm's lifetimes in config/keycloak/realms/_base.json (rememberMe off,
// SSO idle 1800 s, SSO max 36000 s), the apps' own cookies and storage keys.
// A cookie that is not set by any code is not listed: the device cookie of
// MDRS-125 is not built yet.
//
// When the realm's session lifetimes change, `sessionIdle` and `sessionMax`
// change with them.

export const sessionIdle = "30 dakika";
export const sessionMax = "10 saat";

export type CookieRow = {
  /** Shown in mono; several names separated by commas. */
  names: string;
  purpose: string;
  setBy: string;
  lifetime: string;
};

export type CookieGroup = {
  id: string;
  title: string;
  intro: string;
  rows: CookieRow[];
};

export const cookieGroups: CookieGroup[] = [
  {
    id: "zorunlu",
    title: "Zorunlu çerezler",
    intro:
      "Giriş yapmak ve hesabınızı güvenle kullanmak için gerekir; bunlar olmadan Medaris çalışmaz.",
    rows: [
      {
        names: "tedris.session-token, nizam.session-token, nazir.session-token",
        purpose:
          "Giriş yaptığınızı hatırlar. Şifrelenmiştir; tarayıcıdaki betikler okuyamaz.",
        setBy: "Tedris, Nizam ve Nazır",
        lifetime: `30 gün; içindeki oturum ${sessionIdle} işlem yapılmazsa, en geç ${sessionMax} sonra sona erer`,
      },
      {
        names: "csrf-token, callback-url",
        purpose:
          "Giriş ve çıkışı sahte isteklere karşı korur; girişten sonra döneceğiniz sayfayı tutar.",
        setBy: "Tedris, Nizam ve Nazır",
        lifetime: "Tarayıcıyı kapatana kadar",
      },
      {
        names: "pkce.code_verifier, state",
        purpose: "Kimlik sunucusuna gidip gelen giriş adımını güvenceye alır.",
        setBy: "Tedris, Nizam ve Nazır",
        lifetime: "15 dakika",
      },
      {
        names: "KEYCLOAK_IDENTITY, KEYCLOAK_SESSION",
        purpose: "Medaris’in uygulamalarına tek girişle açılan oturumu tutar.",
        setBy: "Medaris kimlik sunucusu",
        lifetime: `Tarayıcıyı kapatana kadar; oturum ${sessionIdle} işlem yapılmazsa, en geç ${sessionMax} sonra sona erer`,
      },
      {
        names: "AUTH_SESSION_ID, KC_RESTART, KC_STATE_CHECKER",
        purpose:
          "Süren bir girişi tutar, zaman aşımına uğrayan girişi yeniden başlatır.",
        setBy: "Medaris kimlik sunucusu",
        lifetime: "Tarayıcıyı kapatana kadar",
      },
      {
        names: "KC_AUTH_SESSION_HASH",
        purpose:
          "Başka bir sekmede tamamlanan girişi giriş sayfasının fark etmesini sağlar.",
        setBy: "Medaris kimlik sunucusu",
        lifetime: "60 saniye",
      },
    ],
  },
  {
    id: "tercih",
    title: "Tercih çerezleri",
    intro:
      "Sayfaları sizin için doğru göstermek üzere bir seçimi ya da durumu hatırlar.",
    rows: [
      {
        names: "medaris-tz",
        purpose:
          "Saatlerin hangi saat diliminde gösterileceğini hatırlar: hesabınızdaki seçim, yoksa tarayıcınızınki.",
        setBy: "Tedris ve Nizam",
        lifetime: "1 yıl",
      },
      {
        names: "tedris.welcomed",
        purpose:
          "Bu tarayıcıda karşılama ekranını görmüş hesapları hatırlar (en çok beş hesap kimliği); çıkış yapınca da kalır.",
        setBy: "Tedris",
        lifetime: "1 yıl",
      },
      {
        names: "nazir-scope",
        purpose: "En son açtığınız medreseyi ya da dersi hatırlar.",
        setBy: "Nazır",
        lifetime: "1 yıl",
      },
      {
        names: "NEXT_LOCALE",
        purpose: "Sayfaların dilini hatırlar.",
        setBy: "Tedris ve Nizam",
        lifetime: "Tarayıcıyı kapatana kadar",
      },
      {
        names: "KEYCLOAK_LOCALE",
        purpose: "Giriş sayfasının dilini hatırlar.",
        setBy: "Medaris kimlik sunucusu",
        lifetime: "Tarayıcıyı kapatana kadar",
      },
    ],
  },
  {
    id: "depolama",
    title: "Tarayıcı depolaması",
    intro:
      "Çerez değildir ve sunucuya gönderilmez; tarayıcınızda, yalnız bu cihazda tutulur.",
    rows: [
      {
        names: "medaris-theme",
        purpose: "Açık ya da koyu görünüm seçiminizi hatırlar.",
        setBy: "Bütün Medaris uygulamaları",
        lifetime: "Siz silene kadar",
      },
      {
        names: "medaris.auth.sign-in",
        purpose:
          "Aynı anda birden fazla sekmede giriş yapılmaya çalışılmasını önler.",
        setBy: "Tedris, Nizam ve Nazır",
        lifetime: "Siz silene kadar; 30 saniye sonra geçersiz sayılır",
      },
      {
        names: "medaris.auth.tab, medaris.auth.auto-retry, medaris-tz-synced",
        purpose:
          "Sekmenin girişi ve saat dilimini bir kez göndermesi için kısa süreli işaretler.",
        setBy: "Tedris, Nizam ve Nazır",
        lifetime: "Sekmeyi kapatana kadar",
      },
    ],
  },
];
