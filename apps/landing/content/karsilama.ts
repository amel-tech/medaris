// Content of the Karşılama page: the marketing page for talebe and for
// medreses. Every claim about the product describes something tedris or the
// medrese portal does on main; the PR that last changed this file lists where
// each one was checked. Notes and questions on lessons (MDRS-150) and lesson
// recordings are not on main and are not mentioned.

export const hero = {
  eyebrow: "Çevrim içi medrese",
  title: "Kitap, müderris, halka.",
  titleSoft: "Nerede olursanız olun.",
  intro:
    "Medrese usulü okumanın üç direği bunlardır. Medaris, medreselerin derslerini çevrim içi açtığı, talebelerin de müderrisle haftalık canlı celselerde okuduğu yerdir.",
  register: "Talebe olarak kaydolun",
  forMadrasahs: "Medreseniz için",
  explore: "Dersleri keşfedin",
  note: "Derslerin tanıtımı ve programı herkese açıktır; hesap açmadan bakabilirsiniz.",
};

/** The first screen's folio: Tâhâ 114, the prayer for knowledge. */
export const folio = {
  label: "Kur’ân-ı Kerîm’den bir âyet",
  sure: "سُورَةُ طه",
  // The ayah's end mark is bound to the word before it with a no-break space.
  ayah: "وَقُل رَّبِّ زِدْنِي عِلْمًا ﴿١١٤﴾",
  meal: "De ki: Rabbim, ilmimi artır.",
  source: "Tâhâ sûresi, 114. âyet",
};

export const promises = [
  {
    title: "Canlı okuyun",
    body: "Müderrisle aynı halkada, haftalık celselerde.",
  },
  {
    title: "Düzenli ilerleyin",
    body: "Hangi hafta ne okunacağı, celsenin ne zaman yapılacağı baştan bellidir.",
  },
  {
    title: "Okuduğunuzu koruyun",
    body: "Kelime ve hadisleri ezber kartlarıyla tekrar edersiniz.",
  },
];

export const talebe = {
  eyebrow: "Talebeler için",
  title: "Bir kitabı baştan sona, müderrisinden okuyun.",
  points: [
    "Ders sayfasında tanıtımı ve haftalık programı görün; derse kaydolun ya da onay isteyen derse başvurun.",
    "Celse vakti geldiğinde celse sayfasındaki “Celseye katıl” düğmesiyle derse girin.",
    "Celseleriniz Google Takvim’e, Apple Takvim’e ya da Outlook’a düşsün; Programım sayfası hepsini gün gün sıralar.",
    "Okuduğunuz kelime ve hadisleri ezber kartlarıyla tekrar edin.",
  ],
  register: "Kaydolun",
  explore: "Dersleri keşfedin",
};

export const medrese = {
  eyebrow: "Medreseler için",
  title: "Medresenizin derslerini çevrim içi açın.",
  points: [
    "Derslerinizi barındırma hakkı olan köşklerde açın; müderrislerini siz seçin.",
    "Önümüzdeki yedi günün celselerini ve onayınızı bekleyen başvuruları panoda bir arada görün.",
    "Talebelerinizi tek listede izleyin: kim hangi derse devam ediyor, hangisini tamamladı.",
    "Kuralı bir kez koyun: “Kayıt her zaman onaylı” ya da “Kapalı ders zorunlu”, medresenin bütün derslerine uygulanır.",
    "Medrese nazırları atayın; gerektiğinde bir talebeyi medreseden yasaklayın.",
  ],
  contact: "Bize yazın",
  note: "Medreseleri Medaris yönetimi açar. İletişim formundan yazın, size dönelim.",
};

export const howItWorks = {
  eyebrow: "Bir ders nasıl ilerler",
  title: "Kaydolun, celseye katılın, tekrar edin.",
  steps: [
    {
      title: "Kaydolun",
      body: "Ders sayfasında tanıtımı, haftaları ve celse tarihlerini hesap açmadan görürsünüz. Beğendiğiniz derse kaydolur ya da başvurursunuz.",
    },
    {
      title: "Celseye katılın",
      body: "Celse sayfasında “Celseye katıl” düğmesi ve toplantı platformunun adı görünür. Ders kadrosu bir YouTube canlı yayın bağlantısı eklediyse, celse sürerken yayın ve altında canlı sohbet açılır.",
    },
    {
      title: "Tekrar edin",
      body: "Kartın arka yüzünü açar, “Ne kadar zordu?” sorusuna Zor, Orta ya da Kolay diye cevap verirsiniz; kart, cevabınıza göre yeniden önünüze gelir.",
    },
  ],
};

/** The picture of a course page beside the steps: a labelled example, not a real course. */
export const sampleCourse = {
  label: "Örnek ders sayfası",
  badge: "Örnek",
  cover: "الصرف",
  science: "Sarf",
  title: "Emsile ve Bina",
  lessonType: "Canlı ders",
  live: "Şu an canlı",
  join: "Celseye katıl",
  lockedLabel: "Kilitli",
  weeks: [
    { title: "1. hafta", when: "Cumartesi 21:00", state: "done" },
    { title: "2. hafta", when: "Cumartesi 21:00", state: "live" },
    { title: "3. hafta", when: "Cumartesi 21:00", state: "locked" },
  ] as const,
  note: "Gerçek bir ders değildir; bir ders sayfasının düzenini gösterir.",
};

export const halka = {
  quote: "Medrese, binasından önce bir halkadır.",
  text: "Bir kitap, onu okutan bir müderris ve dinleyen talebeler. Medaris bu halkayı ekrana taşır; nerede olursanız olun, yeriniz hazırdır.",
};

export const ezber = {
  eyebrow: "Ezber kartları",
  title: "Okuduğunuz sizde kalsın.",
  text: "Kartlar kelime ve hadis desteleri hâlinde durur. Her kart, “Ne kadar zordu?” sorusuna verdiğiniz cevaba göre yeniden önünüze gelir.",
  points: [
    "Başkasının destesindeki bir kartı kendi destenize kopyalayın.",
    "Kartları Excel ya da CSV dosyasından içe aktarın.",
    "Herkese açık bir destenin bağlantısı elinizdeyse, hesap açmadan çalışın; ilerleme kaydedilmez.",
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

export const closing = {
  title: "Halkaya katılın.",
  text: "Hesabınızı açın, derslere kaydolun. Medreseniz için bize yazın.",
  register: "Talebe olarak kaydolun",
  contact: "Medreseniz için bize yazın",
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
