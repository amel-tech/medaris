/**
 * The privacy notice (Aydınlatma Metni, KVKK Art. 10) served at
 * /aydinlatma-metni (MDRS-102). Turkish only: it is the notice the law asks
 * for, not product copy, so it does not go through `@medaris/i18n`.
 *
 * The controller is named only by its e-mail address for now (owner, 4
 * October): the title, postal address, KEP and MERSİS come later, with the
 * legal entity.
 *
 * The wording is a draft until a lawyer approves it. The draft note shows in
 * development only (owner, 4 October), never to a visitor.
 */

/** The data controller's contact. */
export const CONTROLLER = {
  email: "selam@medaris.app",
} as const;

/** Shows the "draft" note: in development, never in a production build. */
export const IS_DRAFT = process.env.NODE_ENV !== "production";

export const TITLE = "Kişisel Verilerin Korunması Hakkında Aydınlatma Metni";

export const LAST_UPDATED = "4 Ekim 2026";

/**
 * Every column of tedrisat's `users` table (MDRS-104,
 * apps/tedrisat/src/database/schema/user.schema.ts), in words. The spec reads
 * that schema and fails when a column is added there without being listed
 * here.
 */
export const ACCOUNT_RECORD_FIELDS: Record<string, string> = {
  id: "hesap kimliği (kimlik sunucusunun size verdiği numara)",
  email: "e-posta adresi",
  email_verified: "e-posta adresinin doğrulanıp doğrulanmadığı",
  given_name: "ad",
  family_name: "soyad",
  time_zone: "saat dilimi tercihi",
  locale: "dil tercihi",
  lesson_invitation_emails: "ders davetlerinin e-postayla gönderilmesi tercihi",
  created_at: "hesabın oluşturulma zamanı",
  last_seen_at: "platformu en son kullandığınız zaman",
};

export type NoticeSection = {
  id: string;
  heading: string;
  paragraphs?: string[];
  items?: string[];
  /** A paragraph printed after the list. */
  closing?: string;
};

export const SECTIONS: NoticeSection[] = [
  {
    id: "veri-sorumlusu",
    heading: "1. Veri sorumlusu",
    paragraphs: [
      "6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla Medaris tarafından bu metinde açıklanan kapsamda işlenir.",
    ],
    items: [`E-posta: ${CONTROLLER.email}`],
  },
  {
    id: "islenen-veriler",
    heading: "2. İşlenen kişisel veriler",
    items: [
      "Kimlik: adınız ve soyadınız.",
      "İletişim: e-posta adresiniz.",
      "Hesap ve kullanım verileri: hesap kimliğiniz, e-posta adresinizin doğrulanıp doğrulanmadığı, dil ve saat dilimi tercihiniz, hesabınızın oluşturulma ve platformu en son kullandığınız zaman, oturum açma kayıtları.",
      "Eğitim kayıtları: katıldığınız köşkler, derslere kaydınız ve katılımınız, oluşturduğunuz ezber kartları, celse videolarına aldığınız notlar ve ders kadrosuna sorduğunuz sorular.",
      "Yazışmalar: iletişim formundan gönderdiğiniz ad, e-posta adresi, konu ve mesaj.",
      "Teknik kayıtlar: sunucuların tuttuğu istek kayıtları (IP adresi, tarayıcı bilgisi, açılan sayfa ve zamanı).",
    ],
    closing: `Hesap kaydınızda tutulan alanların tamamı: ${Object.values(
      ACCOUNT_RECORD_FIELDS
    ).join(", ")}.`,
  },
  {
    id: "amaclar",
    heading: "3. İşleme amaçları",
    items: [
      "Üyelik hesabınızın oluşturulması ve yönetilmesi.",
      "Eğitim hizmetlerinin sunulması: köşklere ve derslere kayıt, canlı ders takvimi, ders kayıtlarına erişim.",
      "Kimliğinizin doğrulanması ve hesap güvenliğinin sağlanması.",
      "E-posta adresinizin doğrulanması, parola sıfırlama ve celse davetleri gibi hesabınızla ve derslerinizle ilgili e-postaların gönderilmesi; celse davetlerini Hesap sayfanızdan kapatabilirsiniz.",
      "İletişim formundan gönderdiğiniz mesajlara cevap verilmesi.",
      "Mevzuattan doğan yükümlülüklerin yerine getirilmesi.",
    ],
  },
  {
    id: "aktarim",
    heading: "4. Kişisel verilerin aktarılması",
    paragraphs: [
      "Kişisel verileriniz, yukarıdaki amaçlarla sınırlı olarak şu alıcılara aktarılır:",
    ],
    items: [
      "Barındırma hizmeti: platform ve veritabanı, Türkiye’deki sunucularında barındırıldığımız Hosting Dünyam’da çalışır.",
      "Kimlik doğrulama sunucusu: kaydınız ve oturum açmanız Medaris’in kendi kimlik sunucusu üzerinden yürütülür; ad, soyad, e-posta adresi ve parolanız (şifrelenmiş olarak) orada tutulur.",
      "E-posta gönderimi: doğrulama, parola sıfırlama ve celse daveti e-postaları ile iletişim formu mesajları bir e-posta gönderim hizmeti üzerinden iletilir; bu e-postalarda adınız, e-posta adresiniz ve ilgili ders bilgisi yer alır.",
    ],
    closing:
      "Yurt dışındaki hizmetler: aşağıdaki hizmetler yurt dışında bulunur ve Medaris’i kullanırken tarayıcınız bunlara doğrudan bağlanır. Sayfaların yazı tipleri Google Fonts’tan (Google LLC, ABD) yüklenir; bu sırada IP adresiniz ve tarayıcı bilgileriniz Google’a ulaşır. Celse sayfasındaki canlı yayın, canlı sohbet ve YouTube ya da Google Drive’daki ders kayıtları açıldığında aynı bilgiler Google’a, Google hesabınızla oturum açıksanız Google çerezleriyle birlikte ulaşır. Bunny Stream’de (BunnyWay d.o.o., Slovenya) barındırılan bir ders kaydını açtığınızda IP adresiniz ve tarayıcı bilgileriniz Bunny’ye ulaşır. Celseye katılmak için açtığınız toplantı platformu (Google Meet, Zoom, Jitsi Meet gibi) kendi şartlarıyla çalışır; Medaris ona sizinle ilgili veri göndermez.",
  },
  {
    id: "yontem-ve-hukuki-sebep",
    heading: "5. Toplama yöntemi ve hukuki sebep",
    paragraphs: [
      "Kişisel verileriniz, kayıt formunu doldurmanız ve platformu kullanmanız sırasında elektronik ortamda, otomatik yollarla toplanır.",
      "Bu veriler KVKK’nın 5. maddesinin 2. fıkrasındaki hukuki sebeplere dayanılarak işlenir: bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (c), veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması (ç) ve ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaatleri için zorunlu olması (f).",
    ],
  },
  {
    id: "haklariniz",
    heading: "6. KVKK’nın 11. maddesi kapsamındaki haklarınız",
    paragraphs: ["Veri sorumlusuna başvurarak:"],
    items: [
      "kişisel verilerinizin işlenip işlenmediğini öğrenme,",
      "işlenmişse buna ilişkin bilgi talep etme,",
      "işlenme amacını ve bunların amacına uygun kullanılıp kullanılmadığını öğrenme,",
      "yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri bilme,",
      "eksik veya yanlış işlenmişse düzeltilmesini isteme,",
      "KVKK’nın 7. maddesindeki şartlar çerçevesinde silinmesini veya yok edilmesini isteme,",
      "düzeltme, silme veya yok etme işlemlerinin, verilerin aktarıldığı üçüncü kişilere bildirilmesini isteme,",
      "işlenen verilerin münhasıran otomatik sistemler vasıtasıyla analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme,",
      "kanuna aykırı olarak işlenmesi sebebiyle zarara uğramanız hâlinde zararın giderilmesini talep etme",
    ],
    closing: "haklarına sahipsiniz.",
  },
  {
    id: "basvuru",
    heading: "7. Başvuru",
    paragraphs: [
      `Haklarınıza ilişkin taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ’e uygun olarak Medaris’e kayıtlı e-posta adresinizden ${CONTROLLER.email} adresine iletebilirsiniz.`,
      "Başvurunuz, niteliğine göre en kısa sürede ve en geç otuz gün içinde ücretsiz olarak sonuçlandırılır.",
    ],
  },
];
