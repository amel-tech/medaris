// Every placeholder of the landing's legal pages, in one place (MDRS-102,
// MDRS-151): Aydınlatma Metni, Kullanım şartları and Çerezler. The owner
// supplies the values; until then the pages show the bracketed placeholder
// and each page's "Taslak metin" notice says the text is a draft.
//
// `grep -n '\[' apps/landing/content/legal.ts` lists what is still open. The
// controller's own details are written once, in content/aydinlatma-metni.ts
// (MDRS-102), and reused here by reference.
import { CONTROLLER } from "./aydinlatma-metni";

export const legal = {
  controllerTitle: CONTROLLER.title,
  address: CONTROLLER.address,
  supportEmail: "[Destek e-posta adresi]",
  kepAddress: CONTROLLER.kep,
  mersisNo: CONTROLLER.mersis,
  hostingProvider: "[Barındırma sağlayıcısı ve ülkesi]",
  transferAbroadBasis: "[Yurt dışına aktarımın dayanağı]",
  deviceCookieLifetime: "[Çerezin geçerlilik süresi]",
  sessionCookieLifetime: "[Giriş çerezinin geçerlilik süresi]",
  retentionPeriod: "[Saklama süresi]",
  // There is no self-service deletion (no tedrisat route, no Keycloak
  // account-console action), so the way is a request to the controller.
  accountDeletionPath:
    "Aydınlatma Metni’nin 7. bölümünde yazan yollardan biriyle veri sorumlusuna yazarak",
  termsEffectiveDate: "[Yürürlük tarihi]",
} as const;
