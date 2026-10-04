// Content of the Karşılama page. Every sentence here describes something
// tedris does on main; the PR that last changed this file lists where each
// one was checked. Notes and questions on lessons (MDRS-150) and lesson
// recordings are not on main and are not mentioned.

import type { IconName } from "@medaris/ui/mds/icon";

export const hero = {
  eyebrow: "Çevrim içi medrese",
  title: "Medrese ilimlerini müderrisle, hafta hafta canlı celselerde okuyun.",
  intro:
    "Medaris’te bir ders haftalara bölünür; her hafta bir ya da birkaç canlı celse yapılır. Programı baştan görür, celseye katılır, okuduklarınızı ezber kartlarıyla tekrar edersiniz.",
  register: "Kayıt ol",
  signIn: "Giriş yap",
  explore: "Önce göz atın",
  note: "Derslerin tanıtımı ve programı herkese açıktır. Toplantı bağlantıları ve canlı yayın derse kayıtlı talebelere görünür.",
};

/** The first screen's picture of a course page: a labelled example, not a real course. */
export const sampleCourse = {
  eyebrow: "Örnek ders sayfası",
  badge: "Örnek",
  title: "Örnek ders",
  caption: "Gerçek bir ders değildir; bir ders sayfasının düzenini gösterir.",
  lessonType: "Canlı ders",
  lockedLabel: "Kilitli",
  weeks: [
    {
      title: "Hafta 1",
      sessions: [
        { title: "Celse 1", when: "Cumartesi 21:00", minutes: "60 dk" },
        { title: "Celse 2", when: "Salı 21:00", minutes: "60 dk" },
      ],
    },
    {
      title: "Hafta 2",
      sessions: [
        { title: "Celse 1", when: "Cumartesi 21:00", minutes: "60 dk" },
      ],
    },
  ],
  note: "Haftalar ve celse saatleri herkese görünür; toplantı bağlantısı kayıtlı talebeler için kilitlidir.",
};

export const structure = {
  title: "Bir dersin yapısı: köşkten celseye",
  intro:
    "Köşkler bir ilmin derslerini bir araya getirir; medreseler derslerini bu köşklerde açar. Her ders haftalara, her hafta celselere bölünür.",
  steps: [
    {
      icon: "kosk",
      title: "Köşk",
      body: "Bir ilim dalına ayrılmış meclis. O ilmin dersleri köşkte bir araya gelir.",
    },
    {
      icon: "medrese",
      title: "Medrese",
      body: "Derslerini, barındırma hakkı olan köşklerde açan kurum.",
    },
    {
      icon: "book",
      title: "Ders",
      body: "Bir ya da birkaç müderrisin okuttuğu kitap ya da konu. Tanıtımı ve programı herkese açıktır; toplantı bağlantıları ve canlı yayın kayıtlı talebelere görünür.",
    },
    {
      icon: "calendar",
      title: "Hafta",
      body: "Ders haftalara bölünür. Her haftanın başlığı ve celseleri programda yazılıdır.",
    },
    {
      icon: "video",
      title: "Celse",
      body: "Müderrisle tarihi belli canlı buluşma. Bir hafta bir ya da birkaç celse içerebilir; bir celsenin toplantı bağlantısı eklendiğinde celse sayfasında görünür.",
    },
  ] satisfies { icon: IconName; title: string; body: string }[],
};

export const celse = {
  title: "Celse: haftanın canlı buluşması",
  intro:
    "Her celsenin tarihi ve saati vardır; toplantı bağlantısı eklendiğinde celse sayfasında görünür.",
  cards: [
    {
      icon: "calendar",
      title: "Takvime ekleyin",
      body: "Celseyi Google Takvim’e ekleyebilir ya da Apple Takvim ve Outlook için .ics dosyası indirebilirsiniz. Tüm derslerinizi tek bir takvim aboneliğiyle de izleyebilirsiniz. Takvime toplantı bağlantısı yazılmaz; kayıt celse sayfasına bağlanır. Programım sayfası celselerinizi gün gün sıralar.",
    },
    {
      icon: "video",
      title: "Celseye katılın",
      body: "Celse sayfasında “Celseye katıl” düğmesi ve toplantı platformunun adı görünür. Ders kadrosu bir YouTube canlı yayın bağlantısı eklediyse, celse sürerken yayın ve altında canlı sohbet açılır. Sohbette yazmak için tarayıcıda YouTube’a giriş yapmış olmanız gerekir.",
    },
    {
      icon: "clock",
      title: "Saat ve değişiklikler",
      body: "Saatler dersin saat diliminde yazılır; sizinkinden farklıysa kendi saatiniz de gösterilir. Kayıt kararları ve celse değişiklikleri size uygulama içi bildirimle ulaşır.",
    },
  ] satisfies { icon: IconName; title: string; body: string }[],
};

export const ezber = {
  title: "Ezber kartları",
  text: "Kartlar kelime ve hadis desteleri hâlinde durur. Çalışırken kartın arka yüzünü açar, “Ne kadar zordu?” sorusuna Zor, Orta ya da Kolay diye yanıt verirsiniz; kart, yanıtınıza göre yeniden önünüze gelir.",
  points: [
    "Desteler bir derse, köşke ya da medreseye bağlı olabilir, herkese de açılabilir; kendi destenizi de oluşturabilirsiniz.",
    "Başkasının destesindeki bir kartı kendi destenize kopyalayabilirsiniz.",
    "Kartları Excel ya da CSV dosyasından içe aktarabilirsiniz.",
    "Herkese açık bir destenin bağlantısı elinizdeyse, hesap açmadan kartları çalışabilirsiniz; ilerleme kaydedilmez.",
  ],
  sample: {
    deck: "Örnek deste",
    badge: "Örnek",
    card: "Kart 1",
    frontLabel: "Ezber kartı örneği, ön yüz",
    backLabel: "Ezber kartı örneği, arka yüz",
    arabic: "إِنَّمَا الْأَعْمَالُ بِالنِّيَّاتِ",
    meaning: "Ameller ancak niyetlere göredir.",
    source: "Buhârî, Müslim",
    question: "Ne kadar zordu?",
    ratings: ["Zor", "Orta", "Kolay"],
  },
};

export const gozat = {
  title: "Hesap açmadan önce bakın",
  intro:
    "Keşfet’te köşkleri ve medreseleri, ders sayfalarında tanıtımı ve programı hesapsız görebilirsiniz.",
  cards: [
    {
      icon: "eye",
      title: "Herkese açık",
      body: "Köşk, medrese ve ders tanıtımları. Haftalar, celse başlıkları ve tarihleri. Bağlantısı elinizdeyse, herkese açık olarak işaretlenmiş bir deste.",
    },
    {
      icon: "lock",
      title: "Derse kayıtlı talebelere",
      body: "Toplantı bağlantıları ve canlı yayın.",
    },
    {
      icon: "check",
      title: "Onay isteyen derslerde",
      body: "Bazı dersler kayıt için onay ister. Başvurunuz onaylanana kadar toplantı bağlantıları ve canlı yayın kilitli kalır; karar size bildirimle ulaşır.",
    },
  ] satisfies { icon: IconName; title: string; body: string }[],
  explore: "Keşfet’e gidin",
};

export const closing = {
  title: "Derslere katılmak için hesap açın",
  text: "Hesap açtıktan sonra derslere kaydolabilir, onay isteyen derslere başvurabilirsiniz.",
  register: "Kayıt ol",
  signIn: "Giriş yap",
  faq: "Sık sorulan sorular",
  consentLead: "Kayıt formunda",
  consentLink: "Aydınlatma Metni",
  consentTail: "’ni okuduğunuzu onaylarsınız.",
};

/**
 * "Medaris'i kim yürütüyor". The owner supplies the text. While any field is
 * still a placeholder, the section is not rendered: a bracketed placeholder
 * never reaches a visitor.
 */
export const operator = {
  title: "Medaris’i kim yürütüyor",
  institutionLabel: "Kurum",
  testimonialLabel: "Görüş",
  institution: "[Medaris’i yürüten kurumun adı ve iki cümlelik tanıtımı]",
  testimonial: "[Bir müderrisin ya da talebenin, izniyle alınmış görüşü]",
  testimonialBy: "[Görüş sahibinin adı ve dersi]",
};

export const isPlaceholder = (text: string) => text.startsWith("[");

/** The fields the "who runs Medaris" section prints, which must all be real text. */
export const operatorFields = [
  operator.institution,
  operator.testimonial,
  operator.testimonialBy,
];
