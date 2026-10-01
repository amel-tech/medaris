// Content of the Karşılama page (A1), as the canvas "Medaris Ekranları" draws
// it (MDRS-151).
//
// The köşkler and dersler are the canvas's sample content. They become live
// data once tedris serves them to signed-out visitors (MDRS-122).

import type { IconName } from "@medaris/ui/mds/icon";

/** A cover's cloth, one of the system's .mds-cover--* colours. */
export type Cloth = "bordo" | "zumrut" | "murekkep";

export const heroCovers: {
  cloth: Cloth;
  label: string;
  title: string;
  height: string;
}[] = [
  {
    cloth: "bordo",
    label: "الصرف",
    title: "Emsile ve Bina",
    height: "block-[calc(var(--space-16)*4)]",
  },
  {
    cloth: "zumrut",
    label: "النحو",
    title: "Avâmil ve Tasrîf",
    height: "block-[calc(var(--space-16)*3.5)]",
  },
  {
    cloth: "murekkep",
    label: "المنطق",
    title: "İsâgûcî ile mantığa giriş",
    height: "block-[calc(var(--space-16)*3.75)]",
  },
];

export const steps: { icon: IconName; title: string; body: string }[] = [
  {
    icon: "medrese",
    title: "Medrese",
    body: "Bir başmüderrisin yönettiği kurum. Derslerini, barındırma hakkı olan köşklerde açar. Her ders bir medreseye bağlı değildir.",
  },
  {
    icon: "kosk",
    title: "Köşk",
    body: "Bir ilim dalına ayrılmış meclis: Arapça dil ilimleri, fıkıh, hadis. Dersler köşklerde açılır.",
  },
  {
    icon: "book",
    title: "Ders",
    body: "Bir ya da birkaç müderrisin okuttuğu kitap ya da konu. Tanıtımı ve müfredatı herkese açıktır, içeriği kayıtlı talebelere.",
  },
  {
    icon: "calendar",
    title: "Hafta",
    body: "Ders haftalara bölünür. Her haftanın konusu ve celse tarihleri müfredatta yazılıdır.",
  },
  {
    icon: "video",
    title: "Celse",
    body: "Müderrisle canlı buluşma. Her celsenin kendi toplantı bağlantısı vardır ve yalnız kayıtlı talebelere açılır.",
  },
];

export const koskler: {
  initials: string;
  name: string;
  field: string;
  body: string;
  level: string;
  courses: number;
}[] = [
  {
    initials: "NK",
    name: "Nûruosmaniye Köşkü",
    field: "Arapça dil ilimleri",
    body: "Arapça dil ilimlerinin köşkü. Sarfa Emsile ve Bina ile başlanır, Avâmil ile nahve geçilir; İzhar şerhiyle derinleşilir.",
    level: "Başlangıç seviyesi",
    courses: 3,
  },
  {
    initials: "FK",
    name: "Fatih Köşkü",
    field: "Fıkıh",
    body: "Fıkıh ve usûl dersleri; usûle mantıkla hazırlanılır.",
    level: "Orta seviye",
    courses: 2,
  },
  {
    initials: "BK",
    name: "Beyazıt Köşkü",
    field: "Hadis",
    body: "Hadis ve siyer okumaları.",
    level: "Başlangıç seviyesi",
    courses: 1,
  },
];

export const dersler: {
  cloth: Cloth;
  label: string;
  title: string;
  muderris: string;
  medrese?: string;
  kosk: string;
  next: { iso: string; text: string };
}[] = [
  {
    cloth: "bordo",
    label: "الصرف",
    title: "Emsile ve Bina",
    muderris: "Abdülhamit Karaosmanoğlu",
    kosk: "Nûruosmaniye Köşkü",
    next: { iso: "2026-10-03T21:00+03:00", text: "Cmt 21:00" },
  },
  {
    cloth: "murekkep",
    label: "المنطق",
    title: "İsâgûcî ile mantığa giriş",
    muderris: "Mehmet Emin Işıkoğlu",
    medrese: "Süleymaniye Medresesi",
    kosk: "Fatih Köşkü",
    next: { iso: "2026-10-03T19:00+03:00", text: "Cmt 19:00" },
  },
  {
    cloth: "zumrut",
    label: "السيرة",
    title: "Siyer okumaları",
    muderris: "Ayşe Nur Kılıçarslan",
    kosk: "Beyazıt Köşkü",
    next: { iso: "2026-10-06T21:00+03:00", text: "Sal 21:00" },
  },
];

export const ezberPoints = [
  "Müderrisin hazırladığı ders destesini çalışırsınız.",
  "Bir desteyi kendi destenize kopyalayıp kart ekleyebilirsiniz.",
  "Herkese açık desteleri hesap açmadan da çalışabilirsiniz.",
];

/**
 * "Medaris'i kim yürütüyor". The canvas draws placeholders; the owner supplies
 * the text. While any field is still a placeholder, the section is not
 * rendered: a bracketed placeholder never reaches a visitor.
 */
export const operator = {
  institution: "[Medaris’i yürüten kurumun adı ve iki cümlelik tanıtımı]",
  testimonial: "[Bir müderrisin ya da talebenin, izniyle alınmış görüşü]",
  testimonialBy: "[Görüş sahibinin adı ve dersi]",
};

export const isPlaceholder = (text: string) => text.startsWith("[");
