/**
 * The privacy notice (Aydınlatma Metni, KVKK Art. 10) served at
 * /aydinlatma-metni (MDRS-102). Turkish only: it is the notice the law asks
 * for, not product copy, so it does not go through `@medaris/i18n`.
 *
 * Everything the owner still has to supply is in `CONTROLLER` below, and only
 * there: each bracketed placeholder is written once in this file and reused
 * by reference, so replacing it here replaces it on the page.
 * `test/privacy-notice.spec.ts` fails if one appears anywhere else in the
 * repository's source.
 *
 * The wording is a draft. The final legal text is the owner's (out of scope
 * for MDRS-102); `IS_DRAFT` puts a visible note on the page until it is
 * approved.
 */

/** The data controller's details — placeholders until the owner fills them. */
export const CONTROLLER = {
  title: "[Veri sorumlusu unvanı]",
  address: "[Adres]",
  email: "[E-posta]",
  kep: "[KEP adresi]",
  mersis: "[MERSİS no]",
} as const;

/** Shows the "draft" note. Set to false once the owner approves the text. */
export const IS_DRAFT = true;

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
      `6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca kişisel verileriniz, veri sorumlusu sıfatıyla ${CONTROLLER.title} (“Medaris”) tarafından bu metinde açıklanan kapsamda işlenir.`,
    ],
    items: [
      `Unvan: ${CONTROLLER.title}`,
      `Adres: ${CONTROLLER.address}`,
      `E-posta: ${CONTROLLER.email}`,
      `KEP adresi: ${CONTROLLER.kep}`,
      `MERSİS no: ${CONTROLLER.mersis}`,
    ],
  },
  {
    id: "islenen-veriler",
    heading: "2. İşlenen kişisel veriler",
    items: [
      "Kimlik: adınız ve soyadınız.",
      "İletişim: e-posta adresiniz.",
      "Hesap ve kullanım verileri: hesap kimliğiniz, e-posta adresinizin doğrulanıp doğrulanmadığı, dil ve saat dilimi tercihiniz, hesabınızın oluşturulma ve platformu en son kullandığınız zaman, oturum açma kayıtları.",
      "Eğitim kayıtları: katıldığınız köşkler, derslere kaydınız ve katılımınız, oluşturduğunuz ezber kartları.",
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
      "E-posta adresinizin doğrulanması ve parola sıfırlama gibi hesabınızla ilgili bildirimlerin gönderilmesi.",
      "Kayıtlı olduğunuz derslerin celseleri için takvim davetlerinin, güncellemelerinin ve iptallerinin e-postayla gönderilmesi; bu davetleri Hesap sayfanızdan kapatabilirsiniz.",
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
      "Kimlik doğrulama sunucusu: kaydınız ve oturum açmanız Medaris’in kimlik sunucusu üzerinden yürütülür; ad, soyad, e-posta adresi ve parolanız (şifrelenmiş olarak) orada tutulur.",
      "Barındırma hizmeti: platform ve veritabanı, hizmet aldığımız barındırma sağlayıcısının sunucularında çalışır.",
      "YouTube (Google): ders kayıtları YouTube’a liste dışı video olarak yüklenmeye başladığında, kayıtlar bu hizmet üzerinden sunulur.",
      "E-posta gönderim hizmeti (Google Gmail): celse davetleri, e-posta adresinize celsenin adı ve zamanıyla birlikte bu hizmet üzerinden gönderilir.",
    ],
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
      `Haklarınıza ilişkin taleplerinizi, Veri Sorumlusuna Başvuru Usul ve Esasları Hakkında Tebliğ’e uygun olarak yazılı şekilde ${CONTROLLER.address} adresine, güvenli elektronik imzalı olarak ${CONTROLLER.kep} KEP adresine ya da Medaris’e kayıtlı e-posta adresinizden ${CONTROLLER.email} adresine iletebilirsiniz.`,
      "Başvurunuz, niteliğine göre en kısa sürede ve en geç otuz gün içinde ücretsiz olarak sonuçlandırılır.",
    ],
  },
];
