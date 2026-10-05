/**
 * Where the İletişim form's messages go, and the address the İletişim page
 * prints (owner, 4 October).
 */
export const CONTACT_ADDRESS = "selam@medaris.app";

/** The İletişim form's topics: the form offers them, the API accepts only them. */
export const contactTopics = [
  { value: "genel", label: "Genel bir soru" },
  { value: "hesap", label: "Hesap ve giriş" },
  { value: "ders", label: "Dersler ve kayıt" },
  { value: "kvkk", label: "Kişisel veriler (KVKK)" },
  { value: "ders-vermek", label: "Medaris’te ders vermek" },
  { value: "diger", label: "Diğer" },
] as const;

export type ContactTopic = (typeof contactTopics)[number]["value"];
