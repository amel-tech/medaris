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
 *
 * Gender and "Medaris ile giriş yap" (owner, 13 October): gender is a
 * required account field kept by the identity server and carried to the apps
 * (#317 and its follow-up), asked so that women's and men's places in
 * in-person lessons are counted apart and a medrese or köşk that needs it
 * knows who of its staff contacts which talebe. Partner applications get the
 * name, e-mail and gender only after the consent screen. No partner is named
 * here. The legal bases written for them are proposals awaiting the owner's
 * and a lawyer's review, not a settled conclusion.
 *
 * The owner, 14 October: the gender is not shown on the public profile (off
 * for now, MDRS-141; whether it will be is decided when the profile is turned
 * back on); a partner application receives only the names, the e-mail
 * address and the gender, never the user name or the language; consent is
 * withdrawn under Tedris → Hesap → "Bağlı uygulamalar".
 */

/** The data controller's contact. */
export const CONTROLLER = {
  email: "selam@medaris.app",
} as const;

/** Shows the "draft" note: in development, never in a production build. */
export const IS_DRAFT = process.env.NODE_ENV !== "production";

export const TITLE = "Kişisel Verilerin Korunması Hakkında Aydınlatma Metni";

export const LAST_UPDATED = "14 Ekim 2026";

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
      "Kimlik: adınız, soyadınız ve cinsiyetiniz.",
      "İletişim: e-posta adresiniz.",
      "Hesap ve kullanım verileri: hesap kimliğiniz, e-posta adresinizin doğrulanıp doğrulanmadığı, dil ve saat dilimi tercihiniz, hesabınızın oluşturulma ve platformu en son kullandığınız zaman, oturum açma kayıtları, “Medaris ile giriş yap” ile girdiğiniz ortak uygulamalara verdiğiniz izinler.",
      "Eğitim kayıtları: katıldığınız köşkler, derslere kaydınız ve katılımınız, oluşturduğunuz ezber kartları, celse videolarına aldığınız notlar, ders kadrosuna sorduğunuz sorular ve celselere yüklediğiniz ödev dosyaları; ödev dosyalarınızı yalnız siz ve ders kadrosu görür.",
      "Yazışmalar: iletişim formundan gönderdiğiniz ad, e-posta adresi, konu ve mesaj.",
      "Teknik kayıtlar: sunucuların tuttuğu istek kayıtları (IP adresi, tarayıcı bilgisi, açılan sayfa ve zamanı).",
    ],
    // Gender is not a `users` column: the identity server keeps it and the
    // apps read it from there (#317 and its follow-up).
    closing: `Hesap kaydınızda tutulan alanların tamamı: ${Object.values(
      ACCOUNT_RECORD_FIELDS
    ).join(
      ", "
    )}. Cinsiyetiniz kimlik sunucusundaki hesabınızda tutulur ve oradan Medaris’in uygulamalarına taşınır.`,
  },
  {
    id: "amaclar",
    heading: "3. İşleme amaçları",
    items: [
      "Üyelik hesabınızın oluşturulması ve yönetilmesi.",
      "Eğitim hizmetlerinin sunulması: köşklere ve derslere kayıt, canlı ders takvimi, ders kayıtlarına ve ders kaynaklarına erişim, ödev dosyalarının ders kadrosuna ulaştırılması.",
      // The owner's two reasons for asking (13 October). Not on the public
      // profile (owner, 14 October).
      "Cinsiyetinizin kullanılması: yüz yüze derslerde kadın ve erkek kontenjanlarının ayrı ayrı sayılması ve ihtiyaç duyan medrese ve köşklerin, hangi talebeyle kadrolarından kimin iletişim kuracağını bilebilmesi. Cinsiyetiniz herkese açık profilinizde gösterilmez ve Medaris’te ders kadrosu ile buna ihtiyaç duyan medrese ve köşk kadrolarından başkası onu görmez.",
      "Kimliğinizin doğrulanması ve hesap güvenliğinin sağlanması.",
      "“Medaris ile giriş yap” seçeneğini sunan ortak uygulamalara Medaris hesabınızla giriş yapabilmeniz ve izin verdiğiniz bilgilerin bu uygulamalara iletilmesi.",
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
      // The storage the owner chose on 12 October for file uploads (MDRS-287,
      // not built yet): a Bunny Storage zone in Frankfurt. BunnyWay d.o.o. is
      // the entity bunny.net/privacy and bunny.net/tos name.
      "Dosya depolama: derslere ve celselere yüklenen kaynak dosyaları ile talebelerin celselere yüklediği ödev dosyaları yurt dışında, Bunny Storage’ın (BunnyWay d.o.o., Slovenya) Almanya’nın Frankfurt kentindeki depolama alanında saklanır.",
      "Kimlik doğrulama sunucusu: kaydınız ve oturum açmanız Medaris’in kendi kimlik sunucusu üzerinden yürütülür; adınız, soyadınız, cinsiyetiniz, kullanıcı adınız, e-posta adresiniz, parolanız (şifrelenmiş olarak) ve ortak uygulamalara verdiğiniz izinler orada tutulur.",
      "E-posta gönderimi: doğrulama, parola sıfırlama ve celse daveti e-postaları ile iletişim formu mesajları bir e-posta gönderim hizmeti üzerinden iletilir; bu e-postalarda adınız, e-posta adresiniz ve ilgili ders bilgisi yer alır.",
      "Ders, medrese ve köşk kadroları: cinsiyetinizi, kaydolduğunuz dersin kadrosu ile buna ihtiyaç duyan medrese ve köşk kadroları, yalnız yüz yüze derslerin kontenjanı ve sizinle kimin iletişim kuracağının belirlenmesi için görür.",
      // Partners stay unnamed (owner, 13 October); what they receive, the
      // owner, 14 October. The account id is the OpenID Connect `sub`, which
      // every sign-in hands to the app; whether the address is verified
      // travels with the address.
      "Ortak uygulamalar: Medaris dışındaki bazı uygulamalar “Medaris ile giriş yap” seçeneği sunar. Bu seçenekle giriş yaptığınızda uygulamanın istediği bilgiler bir onay ekranında listelenir. Bu ekranda izin verirseniz o uygulamaya yalnızca adınız, soyadınız, e-posta adresiniz (doğrulanıp doğrulanmadığıyla birlikte) ve cinsiyetiniz, sizi tanıması için hesap kimliğinizle birlikte iletilir. İzin vermezseniz uygulamaya hiçbir bilgi iletilmez. Kullanıcı adınız ve dil tercihiniz hiçbir ortak uygulamaya iletilmez. Uygulama aldığı bilgileri kendi sorumluluğunda işler; kullanım şartlarını ve gizlilik politikasını yayımladıysa onay ekranı bunlara bağlantı verir.",
    ],
    closing:
      "Yurt dışındaki hizmetler: aşağıdaki hizmetler yurt dışında bulunur ve Medaris’i kullanırken tarayıcınız bunlara doğrudan bağlanır. Sayfaların yazı tipleri Google Fonts’tan (Google LLC, ABD) yüklenir; bu sırada IP adresiniz ve tarayıcı bilgileriniz Google’a ulaşır. Celse sayfasındaki canlı yayın, canlı sohbet ve YouTube ya da Google Drive’daki ders kayıtları açıldığında aynı bilgiler Google’a, Google hesabınızla oturum açıksanız Google çerezleriyle birlikte ulaşır. Bunny Stream’de (BunnyWay d.o.o., Slovenya) barındırılan bir ders kaydını açtığınızda IP adresiniz ve tarayıcı bilgileriniz Bunny’ye ulaşır. Celseye katılmak için açtığınız toplantı platformu (Google Meet, Zoom, Jitsi Meet gibi) kendi şartlarıyla çalışır; Medaris ona sizinle ilgili veri göndermez.",
  },
  {
    id: "yontem-ve-hukuki-sebep",
    heading: "5. Toplama yöntemi ve hukuki sebep",
    paragraphs: [
      "Kişisel verileriniz, kayıt formunu doldurmanız ve platformu kullanmanız sırasında elektronik ortamda, otomatik yollarla toplanır. Cinsiyetinizi hesap açarken kayıt formunda seçersiniz; daha önce açılmış hesaplardan bir sonraki girişte bir kez istenir.",
      "Bu veriler KVKK’nın 5. maddesinin 2. fıkrasındaki hukuki sebeplere dayanılarak işlenir: bir sözleşmenin kurulması veya ifasıyla doğrudan ilgili olması (c), veri sorumlusunun hukuki yükümlülüğünü yerine getirebilmesi için zorunlu olması (ç) ve ilgili kişinin temel hak ve özgürlüklerine zarar vermemek kaydıyla veri sorumlusunun meşru menfaatleri için zorunlu olması (f).",
      // Proposals of 13 October, for the owner's and a lawyer's review: (c)
      // for the quota, (f) for the contact, explicit consent for a partner
      // application. The public profile no longer shows it (14 October).
      "Cinsiyetiniz, yüz yüze derslerin kontenjanı için (c) bendine; iletişim kuracak kişinin belirlenmesi için (f) bendine dayanılarak işlenir. Ortak uygulamalara aktarım ise yalnız onay ekranında verdiğiniz açık rızaya dayanır (KVKK’nın 5. maddesinin 1. fıkrası ve 8. maddesinin 1. fıkrası); bu rızayı dilediğiniz zaman geri alabilirsiniz.",
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
    closing:
      "haklarına sahipsiniz. Adınızı, soyadınızı ve cinsiyetinizi hesabınızdan kendiniz de düzeltebilirsiniz. Bir ortak uygulamaya verdiğiniz izni, Tedris’te Hesap sayfanızdaki “Bağlı uygulamalar” bağlantısından ya da 7. bölümdeki yolla başvurarak dilediğiniz zaman geri alabilirsiniz; bundan sonra o uygulamaya yeni bilgi iletilmez. Geri alma, daha önce yapılmış aktarımları etkilemez; uygulamanın önceden aldığı bilgiler için o uygulamaya başvurabilirsiniz.",
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
