// What Medaris stores in a browser, for the Çerezler page. Measured from the
// code on 12 October (main at #285): the sign-in cookies of @medaris/auth
// (libs/auth/src/server/config.ts, cookies.ts, routes.ts and
// session-cookie.ts) under the prefixes of apps/{tedris,nizam,nazar}/lib/
// auth.ts, its storage keys in libs/auth/src/client/sign-in.ts, Keycloak 26's
// own cookies with the realm's lifetimes in config/keycloak/realms/_base.json
// (#226: SSO idle 18000 s, max 36000 s; remember me on, 14 days idle, 30 days
// max), and the apps' own cookies and storage keys. #285 removed next-auth's
// cookies and `tedris.welcomed`. auth Phase 2 (libs/auth/src/server/
// session-store.ts): with WEB__AUTH_STORE_URL set (production, once its three
// apps have the variable), the session cookie keeps its name but holds only a
// random id, and the session itself is kept, sealed, in Medaris's own Valkey;
// no new third party.
// A cookie that is not set by any code is not listed: the device cookie of
// MDRS-125 is not built yet.
//
// When the realm's session lifetimes change, `sessionIdle` and `sessionMax`
// change with them; `sessionCookieMax` follows `sessionMaxAge` in
// libs/auth/src/server/config.ts.

export const sessionIdle = "5 saat";
export const sessionMax = "10 saat";
export const rememberIdle = "14 gün";
export const rememberMax = "30 gün";
/**
 * The session cookie lives until the refresh token's deadline, which the
 * identity server sets from the realm's lifetimes above; this is its life when
 * the server sets none (`sessionMaxAge`, default 30 days).
 */
export const sessionCookieMax = "30 gün";

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
        names: "tedris.session, nizam.session, nazar.session",
        purpose:
          "Giriş yaptığınızı hatırlar. Yalnızca rastgele bir oturum numarası tutar; giriş bilgileriniz Medaris’in Türkiye’deki sunucusunda şifrelenmiş olarak saklanır. Tarayıcıdaki betikler okuyamaz.",
        setBy: "Tedris, Nizam ve Nazar",
        lifetime: `Kimlik sunucusundaki oturum kadar (sunucu bir süre bildirmezse ${sessionCookieMax}): ${sessionEnds}`,
      },
      {
        names: "tedris.auth-flow.*, nizam.auth-flow.*, nazar.auth-flow.*",
        purpose:
          "Kimlik sunucusuna gidip gelen giriş adımını güvenceye alır; girişten sonra döneceğiniz sayfayı ve dili tutar. Her giriş denemesinin ayrı ve şifrelenmiş bir çerezi olur.",
        setBy: "Tedris, Nizam ve Nazar",
        lifetime: "10 dakika; giriş sonuçlanınca silinir",
      },
      {
        names: "tedris.auth-starts, nizam.auth-starts, nazar.auth-starts",
        purpose:
          "Beş dakika içinde kaç kez giriş başlatıldığını sayar ve girişin durmadan kendini tekrarlamasını önler; yalnız bir sayı ve bir zaman tutar.",
        setBy: "Tedris, Nizam ve Nazar",
        lifetime: "En çok 5 dakika",
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
        names: "nazar-scope",
        purpose: "En son açtığınız medreseyi ya da dersi hatırlar.",
        setBy: "Nazar",
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
        setBy: "Tedris, Nizam ve Nazar",
        lifetime: "Siz silene kadar; 30 saniye sonra geçersiz sayılır",
      },
      {
        names:
          "medaris.auth.tab, medaris.auth.auto-retry, medaris.auth.auto-start, medaris.auth.go-on, medaris-tz-synced",
        purpose:
          "Bir sekmenin kendiliğinden yaptığı giriş denemelerini sınırlayan ve saat dilimini bir kez göndermesini sağlayan kısa süreli işaretler.",
        setBy: "Tedris, Nizam ve Nazar",
        lifetime: "Sekmeyi kapatana kadar",
      },
    ],
  },
];
