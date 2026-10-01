// Every placeholder of the landing's legal pages, in one place (MDRS-102,
// MDRS-151): Aydınlatma Metni, Kullanım şartları and Çerezler. The owner
// supplies the values; until then the pages show the bracketed placeholder
// and each page's "Taslak metin" notice says the text is a draft.
//
// `grep -n '\[' apps/landing/content/legal.ts` lists what is still open.
export const legal = {
  controllerTitle: "[Veri sorumlusunun unvanı]",
  address: "[Adres]",
  supportEmail: "[Destek e-posta adresi]",
  kepAddress: "[KEP adresi]",
  mersisNo: "[Mersis no]",
  hostingProvider: "[Barındırma sağlayıcısı ve ülkesi]",
  transferAbroadBasis: "[Yurt dışına aktarımın dayanağı]",
  deviceCookieLifetime: "[Çerezin geçerlilik süresi]",
  sessionCookieLifetime: "[Giriş çerezinin geçerlilik süresi]",
  retentionPeriod: "[Saklama süresi]",
  accountDeletionPath: "[Hesap silme yolu]",
  termsEffectiveDate: "[Yürürlük tarihi]",
  feeInformation: "[Ücret bilgisi]",
} as const;
