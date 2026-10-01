import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { legal } from "~/content/legal";

export const metadata = { title: "Aydınlatma Metni · Medaris" };

// Aydınlatma Metni: canvas "Medaris Ekranları", AydinlatmaMetni.dc.html. MDRS-151.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader title="Aydınlatma Metni" />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-inline-0 flex-col gap-2 max-inline-measure">
            <h1 className="mds-h1">Aydınlatma Metni</h1>
            <p className="mds-body">
              Bu metin, 6698 sayılı Kişisel Verilerin Korunması Kanunu’nun 10.
              maddesi uyarınca, Medaris’te hangi kişisel verilerin neden ve
              nasıl işlendiğini açıklar.
            </p>
            <p className="mds-caption">
              Son güncelleme: <time dateTime="2026-10-01">1 Ekim 2026</time>
            </p>
          </div>
        </div>

        <div className="grid items-start gap-6 grid-cols-[var(--layout-pane)_minmax(0,1fr)] max-md:grid-cols-1">
          <aside className="sticky inset-bs-[calc(var(--layout-topbar)+var(--space-6))] flex flex-col gap-4 max-md:static">
            <nav
              className="mds-card flex flex-col gap-1"
              aria-label="İçindekiler"
              data-density="compact"
            >
              <p className="mds-eyebrow px-3 pbe-2">İçindekiler</p>
              <a className="mds-nav-item" href="#veri-sorumlusu">
                1. Veri sorumlusu
              </a>
              <a className="mds-nav-item" href="#islenen-veriler">
                2. İşlenen kişisel veriler
              </a>
              <a className="mds-nav-item" href="#amaclar">
                3. İşleme amaçları
              </a>
              <a className="mds-nav-item" href="#aktarim">
                4. Kişisel verilerin aktarılması
              </a>
              <a className="mds-nav-item" href="#cihaz-tanimlayicisi">
                5. Cihaz tanımlayıcısı
              </a>
              <a className="mds-nav-item" href="#hukuki-sebep">
                6. Toplama yöntemi ve hukuki sebep
              </a>
              <a className="mds-nav-item" href="#haklar">
                7. Haklar ve başvuru yolu
              </a>
            </nav>
            <p className="mds-caption px-4">
              Sorularınız için <a href="/iletisim">İletişim</a> sayfasından
              yazabilirsiniz.
            </p>
          </aside>
          <article className="flex min-inline-0 flex-col gap-10">
            <div
              className="mds-alert mds-alert--neutral max-inline-measure"
              role="note"
            >
              <span className="mds-alert__icon" aria-hidden="true"></span>
              <div>
                <p className="mds-alert__title">Taslak metin</p>
                Veri sorumlusunun bilgileri ve hukuki değerlendirme eklendiğinde
                bu metin güncellenecektir.
              </div>
            </div>

            <section
              className="mds-reading"
              id="veri-sorumlusu"
              aria-labelledby="b1"
            >
              <h2 className="mds-h3" id="b1">
                1. Veri sorumlusu
              </h2>
              <p>
                6698 sayılı Kişisel Verilerin Korunması Kanunu (“KVKK”) uyarınca
                kişisel veriler, veri sorumlusu sıfatıyla{" "}
                {legal.controllerTitle} (“Medaris”) tarafından bu metinde
                açıklanan kapsamda işlenir.
              </p>
              <dl className="grid gap-y-2 gap-x-6 items-baseline grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="mds-label">Unvan</dt>
                <dd>{legal.controllerTitle}</dd>
                <dt className="mds-label">Adres</dt>
                <dd>{legal.address}</dd>
                <dt className="mds-label">E-posta</dt>
                <dd>{legal.supportEmail}</dd>
                <dt className="mds-label">KEP adresi</dt>
                <dd>{legal.kepAddress}</dd>
                <dt className="mds-label">Mersis no</dt>
                <dd>{legal.mersisNo}</dd>
              </dl>
            </section>

            <section
              className="mds-reading"
              id="islenen-veriler"
              aria-labelledby="b2"
            >
              <h2 className="mds-h3" id="b2">
                2. İşlenen kişisel veriler
              </h2>
              <p>
                Medaris’te hesap açan, derslere katılan ya da siteyi ziyaret
                eden kişilerin şu verileri işlenir:
              </p>
              <ul className="mbe-0 ps-6">
                <li>Kimlik: ad, soyad ve girişte kullanılan kullanıcı adı.</li>
                <li>İletişim: e-posta adresi.</li>
                <li>
                  Hesap ve kullanım: hesap kimliği, e-posta adresinin doğrulanıp
                  doğrulanmadığı, saat dilimi tercihi, hesabın açıldığı ve
                  platformun en son kullanıldığı zaman, giriş kayıtları.
                </li>
                <li>
                  Eğitim bilgileri: derslere kayıt ve kayıt başvuruları, ders
                  ilerlemesi, ezber desteleri ve kartları.
                </li>
                <li>
                  Ders kayıtları: kaydı alınan celselerde yer alan ses ve
                  görüntü.
                </li>
                <li>
                  Yaptırım kayıtları: bir derse, köşke, medreseye ya da
                  platforma erişimin kaldırılması, gerekçesi ve tarihi.
                </li>
                <li>
                  Denetim kayıtları: görevlilerin yönetim işlemleri, e-postayla
                  yapılan kişi aramaları ve müderris ile talebe dışındaki
                  kişilerin ders içeriği okumaları.
                </li>
                <li>
                  İletişim formu: formla gönderilen ad, e-posta adresi, konu ve
                  mesaj.
                </li>
                <li>Cihaz tanımlayıcısı: 5. bölümde ayrıca açıklanmıştır.</li>
              </ul>
            </section>

            <section className="mds-reading" id="amaclar" aria-labelledby="b3">
              <h2 className="mds-h3" id="b3">
                3. İşleme amaçları
              </h2>
              <ul className="mbe-0 ps-6">
                <li>Üyelik hesabının açılması ve yönetilmesi.</li>
                <li>
                  Eğitim hizmetinin sunulması: derslere kayıt ve başvuru, celse
                  takvimi, toplantı bağlantılarının ve ders kayıtlarının kayıtlı
                  talebelere açılması.
                </li>
                <li>Kimliğin doğrulanması ve hesap güvenliğinin sağlanması.</li>
                <li>
                  E-posta doğrulama, şifre sıfırlama ve derslerle ilgili
                  bildirimlerin gönderilmesi.
                </li>
                <li>
                  Platform kurallarına aykırı davranış hâlinde erişimin
                  kaldırılması ve bunun aynı cihazdan başka bir hesapla
                  aşılmasının önlenmesi.
                </li>
                <li>Görevlilerin işlemlerinin denetlenmesi.</li>
                <li>
                  İletişim formuyla gönderilen soru ve taleplerin cevaplanması.
                </li>
                <li>Mevzuattan doğan yükümlülüklerin yerine getirilmesi.</li>
              </ul>
            </section>

            <section className="mds-reading" id="aktarim" aria-labelledby="b4">
              <h2 className="mds-h3" id="b4">
                4. Kişisel verilerin aktarılması
              </h2>
              <p>
                Kişisel veriler, yukarıdaki amaçlarla sınırlı olarak şu
                alıcılara aktarılır:
              </p>
              <ul className="mbe-0 ps-6">
                <li>
                  Ders ve medrese kadrosu: kayıtlı olunan dersin kadrosu,
                  talebenin adını ve e-posta adresini görür; medrese dersinde
                  medrese kadrosu da kendi kapsamındaki talebeler için aynısını
                  görür.
                </li>
                <li>
                  Kimlik doğrulama sunucusu: kayıt ve giriş Medaris’in kimlik
                  sunucusu üzerinden yürütülür; ad, soyad, kullanıcı adı,
                  e-posta adresi ve şifrenin özeti orada tutulur.
                </li>
                <li>
                  Barındırma hizmeti: platform ve veritabanı, hizmet alınan
                  barındırma sağlayıcısının sunucularında çalışır:{" "}
                  {legal.hostingProvider}.
                </li>
                <li>
                  Bunny (bunny.net): Medaris’te barındırılan ders kayıtları bu
                  hizmette saklanır ve imzalı, süreli bağlantılarla oynatılır.
                </li>
                <li>
                  YouTube (Google): yalnız herkese açık olarak işaretlenen ders
                  kayıtları YouTube’da barındırılabilir.
                </li>
              </ul>
              <p>
                Celseye katılmak için kullanılan toplantı platformları (Google
                Meet, Zoom, Jitsi Meet) ve celse sayfasına gömülen canlı yayın,
                müderrisin kullandığı hizmetten açılır. Bu hizmetler
                kullanılırken onların kendi aydınlatma metinleri geçerlidir.
              </p>
              <p>
                Bu alıcılardan bazılarının sunucuları yurt dışındadır. Yurt
                dışına aktarım, KVKK’nın 9. maddesine göre{" "}
                {legal.transferAbroadBasis} ile yapılır.
              </p>
            </section>

            <section
              className="mds-reading"
              id="cihaz-tanimlayicisi"
              aria-labelledby="b5"
            >
              <h2 className="mds-h3" id="b5">
                5. Cihaz tanımlayıcısı
              </h2>
              <p>
                Medaris’i açan her tarayıcıya, ilk ziyarette rastgele üretilmiş
                bir cihaz tanımlayıcısı taşıyan bir çerez yerleştirilir. Çerez
                her ziyaretçiye aynı biçimde verilir; tarayıcı parmak izi
                alınmaz. Sunucuda tanımlayıcının kendisi değil anahtarlı özeti,
                hangi hesapla kullanıldığı ve ilk ve son görülme zamanı tutulur.
              </p>
              <p>
                Amacı, platformun güvenliğini sağlamak ve erişimi kaldırılan bir
                kişinin aynı cihazdan başka bir hesapla dönmesini önlemektir.
                Çerezin geçerlilik süresi {`${legal.deviceCookieLifetime};`}
                sunucudaki kayıt, son kullanımdan {legal.retentionPeriod} sonra
                silinir.
              </p>
              <p>
                Sitede kullanılan çerezlerin listesi{" "}
                <a href="/cerezler">Çerezler</a> sayfasındadır.
              </p>
            </section>

            <section
              className="mds-reading"
              id="hukuki-sebep"
              aria-labelledby="b6"
            >
              <h2 className="mds-h3" id="b6">
                6. Toplama yöntemi ve hukuki sebep
              </h2>
              <p>
                Kişisel veriler, kayıt ve iletişim formlarının doldurulması ve
                platformun kullanılması sırasında elektronik ortamda, otomatik
                yollarla toplanır. Cihaz tanımlayıcısı, siteye ilk girişte
                tarayıcıya yerleştirilen çerezle toplanır.
              </p>
              <p>
                Bu veriler KVKK’nın 5. maddesinin 2. fıkrasındaki hukuki
                sebeplere dayanılarak işlenir: bir sözleşmenin kurulması veya
                ifasıyla doğrudan ilgili olması (c), veri sorumlusunun hukuki
                yükümlülüğünü yerine getirebilmesi için zorunlu olması (ç) ve
                ilgili kişinin temel hak ve özgürlüklerine zarar vermemek
                kaydıyla veri sorumlusunun meşru menfaatleri için zorunlu olması
                (f).
              </p>
            </section>

            <section className="mds-reading" id="haklar" aria-labelledby="b7">
              <h2 className="mds-h3" id="b7">
                7. Haklar ve başvuru yolu
              </h2>
              <p>
                KVKK’nın 11. maddesi uyarınca ilgili kişi, veri sorumlusuna
                başvurarak:
              </p>
              <ul className="mbe-0 ps-6">
                <li>kişisel verilerinin işlenip işlenmediğini öğrenme,</li>
                <li>işlenmişse buna ilişkin bilgi talep etme,</li>
                <li>
                  işlenme amacını ve bunların amacına uygun kullanılıp
                  kullanılmadığını öğrenme,
                </li>
                <li>
                  yurt içinde veya yurt dışında aktarıldığı üçüncü kişileri
                  bilme,
                </li>
                <li>eksik veya yanlış işlenmişse düzeltilmesini isteme,</li>
                <li>
                  KVKK’nın 7. maddesindeki şartlar çerçevesinde silinmesini veya
                  yok edilmesini isteme,
                </li>
                <li>
                  düzeltme, silme veya yok etme işlemlerinin, verilerin
                  aktarıldığı üçüncü kişilere bildirilmesini isteme,
                </li>
                <li>
                  işlenen verilerin münhasıran otomatik sistemler vasıtasıyla
                  analiz edilmesi suretiyle aleyhine bir sonucun ortaya
                  çıkmasına itiraz etme,
                </li>
                <li>
                  kanuna aykırı olarak işlenmesi sebebiyle zarara uğraması
                  hâlinde zararın giderilmesini talep etme
                </li>
              </ul>
              <p>haklarına sahiptir.</p>
              <h3 className="mds-h4" id="basvuru">
                Başvuru yolu
              </h3>
              <p>
                Haklara ilişkin talepler, Veri Sorumlusuna Başvuru Usul ve
                Esasları Hakkında Tebliğ’e uygun olarak yazılı şekilde{" "}
                {legal.address} adresine, güvenli elektronik imzayla{" "}
                {legal.kepAddress} KEP adresine ya da Medaris’e kayıtlı e-posta
                adresinden {legal.supportEmail} adresine iletilebilir.
              </p>
              <p>
                Başvurular, niteliğine göre en kısa sürede ve en geç otuz gün
                içinde ücretsiz olarak sonuçlandırılır.
              </p>
            </section>
          </article>
        </div>
      </main>
      <SiteFooter current="/aydinlatma-metni" />
    </>
  );
}
