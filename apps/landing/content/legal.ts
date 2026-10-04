// The values the landing's legal pages share (MDRS-102, MDRS-151): Aydınlatma
// Metni, Kullanım şartları and Çerezler. The support address is the contact
// form's own (`lib/contact.ts`).
import { CONTACT_ADDRESS } from "~/lib/contact";

export const legal = {
  supportEmail: CONTACT_ADDRESS,
  hostingProvider: "Hosting Dünyam (Türkiye)",
  retentionPeriod: "ilgili mevzuatta öngörülen azami süre",
  // There is no self-service deletion (no tedrisat route, no Keycloak
  // account-console action), so the way is a request to the controller.
  accountDeletionPath:
    "Aydınlatma Metni’nin 7. bölümünde yazan yollardan biriyle veri sorumlusuna yazarak",
  termsEffectiveDate: "4 Ekim 2026",
} as const;
