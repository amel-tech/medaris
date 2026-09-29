import { PRIVACY_NOTICE_PATH } from "@medaris/utils";

export const footerExploreLinks = [
  { key: "vision" as const, href: "#vision" },
  { key: "curriculum" as const, href: "#curriculum" },
  { key: "partnerships" as const, href: "#partnership" },
] as const;

export const footerSupportLinks = [
  { key: "faq" as const, href: "#" },
  { key: "contact" as const, href: "#" },
  { key: "privacy" as const, href: "#" },
] as const;

export const footerLegalLinks = [
  { key: "privacyNotice" as const, href: PRIVACY_NOTICE_PATH },
  { key: "terms" as const, href: "#" },
  { key: "cookies" as const, href: "#" },
] as const;
