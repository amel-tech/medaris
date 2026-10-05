// What Medaris stores in a browser, for the Çerezler page. Measured from the
// code on 4 October (main together with the open pull requests): NextAuth 4's
// cookies in apps/*/lib/auth_cookies.ts, Keycloak 26's own cookies with the
// realm's lifetimes in config/keycloak/realms/_base.json (#226: SSO idle
// 18000 s, max 36000 s; remember me on, 14 days idle, 30 days max), the
// apps' own cookies and storage keys.
// A cookie that is not set by any code is not listed: the device cookie of
// MDRS-125 is not built yet.
//
// When the realm's session lifetimes change, `sessionIdle` and `sessionMax`
// change with them.

export const sessionIdle = "5 saat";
export const sessionMax = "10 saat";
export const rememberIdle = "14 gün";
export const rememberMax = "30 gün";

/** How long a signed-in session lasts, with and without "Beni hatırla". */
const sessionEnds = `oturum ${sessionIdle} işlem yapılmazsa, en geç ${sessionMax} sonra sona erer; “Beni hatırla”yı işaretlediyseniz ${rememberIdle} işlem yapılmazsa, en geç ${rememberMax} sonra`;

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
        names: "tedris.session-token, nizam.session-token, nazar.session-token",
        purpose:
          "Giriş yaptığınızı hatırlar. Şifrelenmiştir; tarayıcıdaki betikler okuyamaz.",
        setBy: "Tedris, Nizam ve Nazır",
        lifetime: `30 gün; içindeki ${sessionEnds}`,
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
        lifetime: `Tarayıcıyı kapatana kadar, “Beni hatırla”yı işaretlediyseniz ${rememberMax}; ${sessionEnds}`,
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
        names: "nazar-scope",
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
        names: "KEYCLOAK_REMEMBER_ME",
        purpose:
          "“Beni hatırla”yı işaretlediğinizde kullanıcı adınızı giriş formuna yeniden yazar.",
        setBy: "Medaris kimlik sunucusu",
        lifetime: "1 yıl",
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
