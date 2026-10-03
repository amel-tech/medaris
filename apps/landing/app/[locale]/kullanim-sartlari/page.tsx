import { setRequestLocale } from "next-intl/server";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { legal } from "~/content/legal";

export const metadata = { title: "Kullanım şartları · Medaris" };

// Kullanım şartları: canvas "Medaris Ekranları", KullanimSartlari.dc.html. MDRS-151.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader title="Kullanım şartları" />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-inline-0 flex-col gap-2 max-inline-measure">
            <h1 className="mds-h1">Kullanım şartları</h1>
            <p className="mds-body">
              Bu metin, Medaris’i kullanırken uyulacak kuralları açıklar.
              Girişte gördüğünüz şartların özeti, bu metnin kısa hâlidir.
            </p>
            <p className="mds-caption">
              Son güncelleme: <time dateTime="2026-10-01">1 Ekim 2026</time> ·
              Yürürlük tarihi: {legal.termsEffectiveDate}
            </p>
          </div>
        </div>

        <div
          className="mds-alert mds-alert--neutral max-inline-measure"
          role="note"
        >
          <span className="mds-alert__icon" aria-hidden="true"></span>
          <div>
            <p className="mds-alert__title">Taslak — hukuk onayı bekliyor</p>
            Bu metin henüz hukukçu onayından geçmedi. Köşeli parantezli bilgiler
            eklenip onay alındığında yürürlüğe girer.
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
              <a className="mds-nav-item" href="#kapsam">
                1. Kapsam ve tanımlar
              </a>
              <a className="mds-nav-item" href="#hesap">
                2. Hesap ve giriş
              </a>
              <a className="mds-nav-item" href="#basvuru-kayit">
                3. Derslere başvuru ve kayıt
              </a>
              <a className="mds-nav-item" href="#icerik-erisimi">
                4. Ders içeriğine erişim
              </a>
              <a className="mds-nav-item" href="#celseler">
                5. Celseler ve ders kayıtları
              </a>
              <a className="mds-nav-item" href="#desteler">
                6. Desteler
              </a>
              <a className="mds-nav-item" href="#davranis">
                7. Davranış kuralları ve erişimin kaldırılması
              </a>
              <a className="mds-nav-item" href="#cihaz">
                8. Cihaz kısıtlaması
              </a>
              <a className="mds-nav-item" href="#hesap-kapatma">
                9. Hesabın kapatılması
              </a>
              <a className="mds-nav-item" href="#degisiklikler">
                10. Değişiklikler
              </a>
              <a className="mds-nav-item" href="#iletisim">
                11. İletişim
              </a>
            </nav>
            <p className="mds-caption px-4">
              Sorularınız için <a href="/iletisim">İletişim</a> sayfasından
              yazabilirsiniz. Kişisel verileriniz{" "}
              <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nde anlatılır.
            </p>
          </aside>
          <article className="flex min-inline-0 flex-col gap-10">
            <section className="mds-reading" id="kapsam" aria-labelledby="s1">
              <h2 className="mds-h3" id="s1">
                1. Kapsam ve tanımlar
              </h2>
              <p>
                Bu şartlar, Medaris’i ziyaret eden, hesap açan ve derslere
                katılan herkes için geçerlidir. Medaris, {legal.controllerTitle}{" "}
                tarafından işletilir.
              </p>
              <p>Metinde geçen adlar şu anlamlarda kullanılır:</p>
              <dl className="grid gap-y-4 gap-x-6 grid-cols-[repeat(auto-fit,minmax(min(14rem,100%),1fr))]">
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Köşk</dt>
                  <dd className="m-0">
                    Derslerin açıldığı, bir ilim alanına ayrılmış topluluk.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Medrese</dt>
                  <dd className="m-0">
                    Birden çok köşkte ders açabilen kurum.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Ders</dt>
                  <dd className="m-0">
                    Haftalara ve celselere bölünmüş eğitim.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Celse</dt>
                  <dd className="m-0">
                    Tarihi ve saati belli, canlı yapılan tek bir ders buluşması.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Ders kaydı</dt>
                  <dd className="m-0">
                    Bir celsenin kaydedilmiş ses ve görüntüsü.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Deste</dt>
                  <dd className="m-0">
                    Ezber kartlarından oluşan çalışma kümesi.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Talebe</dt>
                  <dd className="m-0">
                    Bir derse kayıtlı ya da kayıt başvurusu yapmış kişi.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Ders kadrosu</dt>
                  <dd className="m-0">
                    Dersi yürüten müderrisler ile derste yetki verilmiş
                    görevliler.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Köşk nazımı</dt>
                  <dd className="m-0">
                    Köşkün işleyişinden sorumlu olarak görevlendirilmiş kişi.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Medrese kadrosu</dt>
                  <dd className="m-0">
                    Medresenin başmüderrisi ile yetki verilmiş medrese
                    nazırları.
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="mds-label">Medaris yönetimi</dt>
                  <dd className="m-0">
                    Medaris başnazımı ile yetki verilmiş Medaris nazımları.
                  </dd>
                </div>
              </dl>
            </section>

            <section className="mds-reading" id="hesap" aria-labelledby="s2">
              <h2 className="mds-h3" id="s2">
                2. Hesap ve giriş
              </h2>
              <p>
                Köşk, medrese ve ders sayfaları, gizlenmedikleri ve köşk
                listelenmeyen olarak ayarlanmadığı sürece herkese açıktır. Derse
                başvurmak ve ders içeriğine erişmek için hesap gerekir.
              </p>
              <ul className="mbe-0 ps-6">
                <li>
                  Hesap açarken ad, soyad, kullanıcı adı, e-posta adresi ve
                  şifre verilir. Hesap, e-posta adresinin doğrulanmasıyla
                  etkinleşir.
                </li>
                <li>
                  Verilen bilgilerin doğru olması gerekir. Kayıtlı olunan dersin
                  kadrosu, talebenin adını ve e-posta adresini görür; medrese
                  dersinde medrese kadrosu da kendi kapsamındaki talebeler için
                  aynısını görür.
                </li>
                <li>
                  Kullanıcı adı yalnızca giriş yapmak için kullanılır; başka
                  kişilere gösterilmez.
                </li>
                <li>
                  Hesap kişiseldir. Giriş bilgileri başkasıyla paylaşılamaz ve
                  hesap başkasına kullandırılamaz.
                </li>
                <li>
                  Giriş, bu şartların kabul edilmesiyle tamamlanır; kabul tarihi
                  hesapta saklanır.
                </li>
                <li>
                  Kişisel veriler,{" "}
                  <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nde
                  açıklandığı şekilde işlenir.
                </li>
              </ul>
            </section>

            <section
              className="mds-reading"
              id="basvuru-kayit"
              aria-labelledby="s3"
            >
              <h2 className="mds-h3" id="s3">
                3. Derslere başvuru ve kayıt
              </h2>
              <p>
                Bazı derslere kayıt, ders kadrosunun onayına bağlıdır; bu
                derslerde kayıt başvuruyla başlar. Başvuru, dersin müderrisi ya
                da bu yetkiyi taşıyan görevli tarafından onaylanır ya da
                reddedilir. Ret gerekçesi yazılmışsa başvuru sahibi onu
                bildirimde görür.
              </p>
              <ul className="mbe-0 ps-6">
                <li>
                  Onay bekleyen başvuru geri çekilebilir. Kayıtlı talebe dersten
                  ayrılabilir; erişimi kaldırılmış talebe dersten ayrılamaz,
                  erişimin kaldırıldığı kaydı korunur.
                </li>
                <li>
                  Talebe, ders kadrosu tarafından gerekçe yazılarak dersten
                  çıkarılabilir. Bu bir yaptırım değildir; talebe derse yeniden
                  başvurabilir. Kurallara aykırı davranış hâlinde ise erişimin
                  kaldırılması uygulanır (<a href="#davranis">7. bölüm</a>).
                </li>
                <li>
                  Dersi tamamladığını ders kadrosu işaretler; ders ilerlemesini
                  talebe kendisi girer.
                </li>
              </ul>
            </section>

            <section
              className="mds-reading"
              id="icerik-erisimi"
              aria-labelledby="s4"
            >
              <h2 className="mds-h3" id="s4">
                4. Ders içeriğine erişim
              </h2>
              <p>
                Köşk, medrese ve ders sayfalarında haftaların ve celselerin
                başlıkları ve tarihleri herkese açıktır.
              </p>
              <p>
                Celse içeriği, toplantı bağlantıları ve ders kayıtları yalnızca
                derse kayıtlı talebelere, ders kadrosuna ve yetkili yöneticilere
                açılır. Bu içerik başkalarıyla paylaşılamaz; toplantı
                bağlantısı, ders kaydı bağlantısı ve içeriğin kendisi izinsiz
                yayımlanamaz.
              </p>
              <p>
                Herkese açık olarak işaretlenen ders kayıtları ile ders
                sayfasında örnek olarak gösterilen celse bunun dışındadır;
                bunlara herkes erişebilir. Müderris ve talebe dışındaki
                kişilerin ders içeriğini okuması denetim kaydına yazılır.
              </p>
            </section>

            <section className="mds-reading" id="celseler" aria-labelledby="s5">
              <h2 className="mds-h3" id="s5">
                5. Celseler ve ders kayıtları
              </h2>
              <ul className="mbe-0 ps-6">
                <li>
                  Celseler, müderrisin seçtiği toplantı platformunda (örneğin
                  Google Meet, Zoom ya da Jitsi Meet) yapılır. Toplantı
                  bağlantısını müderris ya da yetkili görevli celseye ekler.
                  Platform kullanılırken platformun kendi şartları da
                  geçerlidir.
                </li>
                <li>
                  Celsenin tarihi ve saati değişebilir, celse iptal edilebilir.
                  Değişiklikler takvimde görünür ve kayıtlı talebelere
                  bildirilir.
                </li>
                <li>
                  Celse canlı yayınla yapılıyorsa yayın müderrisin kendi
                  hesabından açılır ve celse sayfasına gömülür.
                </li>
                <li>
                  Celseler kayda alınabilir. Kaydı alınan celsede yer alan ses
                  ve görüntü, ders kaydı olarak kayıtlı talebelere açılır.
                </li>
                <li>
                  Celseler ve ders kayıtları izinsiz kaydedilemez, çoğaltılamaz
                  ya da başka bir ortamda yayımlanamaz.
                </li>
              </ul>
            </section>

            <section className="mds-reading" id="desteler" aria-labelledby="s6">
              <h2 className="mds-h3" id="s6">
                6. Desteler
              </h2>
              <p>
                Deste, ezber kartlarından oluşur. Kişisel deste sahibine
                görünür; sahibi destesini ve kartlarını dilediği zaman
                düzenleyebilir ya da silebilir. Medaris başnazımı kişisel
                desteyi yalnızca okuyabilir, düzenleyemez; her okuma denetim
                kaydına yazılır.
              </p>
              <ul className="mbe-0 ps-6">
                <li>
                  Ders destesini müderris, köşk destesini köşk nazımı açar; köşk
                  destesi için müderris öneride bulunabilir. Paylaşılan desteye
                  talebe kart eklemez, kartı kendi destesine kopyalar.
                </li>
                <li>
                  Bir desteyi herkese açmak için sahibi yayın isteği gönderir.
                  İsteği Medaris yönetimi, desteyi okuyarak inceler; deste
                  yayımlanır ya da gerekçe yazılarak reddedilir. Sahibi,
                  yayımlanmış destesini dilediği zaman özel hâle çekebilir.
                </li>
                <li>
                  Medaris başnazımı, yayımlanmış bir desteyi gerekçe yazarak
                  yayından kaldırabilir. Deste herkese açık listeden çıkar,
                  sahibine özel olarak kalır ve gerekçe sahibine bildirilir.
                </li>
                <li>Herkese açık destede hazırlayanın adı gösterilmez.</li>
              </ul>
            </section>

            <section className="mds-reading" id="davranis" aria-labelledby="s7">
              <h2 className="mds-h3" id="s7">
                7. Davranış kuralları ve erişimin kaldırılması
              </h2>
              <h3 className="mds-h4">Davranış kuralları</h3>
              <p>Medaris’te şu kurallara uyulması beklenir:</p>
              <ul className="mbe-0 ps-6">
                <li>
                  Diğer katılımcılara hakaret edilmez; kırıcı ya da uygunsuz
                  mesaj ve görüntü paylaşılmaz.
                </li>
                <li>
                  Celse sırasında ders dışı reklam ya da bağlantı paylaşılmaz.
                </li>
                <li>
                  Toplantı bağlantıları, ders kayıtları ve ders içeriği izinsiz
                  paylaşılmaz ya da yayımlanmaz.
                </li>
                <li>Başkalarının konuşmaları izinsiz kaydedilmez.</li>
                <li>Hesap başkasına kullandırılmaz.</li>
              </ul>
              <h3 className="mds-h4">Erişimin kaldırılması</h3>
              <p>
                Kurallara aykırı davranış hâlinde kişinin erişimi
                kaldırılabilir. Erişim bir dersten, bir köşkten, bir medreseden
                ya da Medaris’in tamamından kaldırılır. Kararı kapsamına göre
                dersin kadrosu, köşk nazımı, medrese kadrosu ya da Medaris
                yönetimi verir. Erişimi kaldırılan kişi, ilgili sayfada
                erişiminin kaldırıldığını görür.
              </p>
              <p>
                Erişimin kaldırılması da geri verilmesi de gerekçe yazılarak
                yapılır ve kayda geçer. Erişimi kaldıran kademe ya da daha üst
                bir kademe onu geri verebilir; alt kademe, üst kademenin
                kararını geri alamaz. Platformdan erişimin kaldırılması, hesabın
                kapatılmasını da içerebilir.
              </p>
            </section>

            <section className="mds-reading" id="cihaz" aria-labelledby="s8">
              <h2 className="mds-h3" id="s8">
                8. Cihaz kısıtlaması
              </h2>
              <p>
                Medaris’i açan her tarayıcıya, ilk ziyarette rastgele üretilmiş
                bir cihaz tanımlayıcısı taşıyan bir çerez yerleştirilir. Çerezin
                amacı ve süresi <a href="/cerezler">Çerezler</a> sayfasında ve{" "}
                <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nde anlatılır.
              </p>
              <ul className="mbe-0 ps-6">
                <li>
                  Bir kişinin erişimi kaldırıldığında, hesabın kullanıldığı
                  cihazlar da aynı kapsamda erişim kısıtlamasına alınabilir.
                </li>
                <li>
                  Kısıtlanan cihazdan, erişimin kaldırıldığı kapsamda yeni bir
                  hesapla kayıt başvurusu yapılamaz ve o kapsamdaki celselere
                  katılınamaz; erişim Medaris’in tamamından kaldırılmışsa
                  cihazdan hiçbir sayfa kullanılamaz. Kısıtlamadan önce o cihazı
                  kullanan diğer hesaplar bundan etkilenmez.
                </li>
                <li>
                  Kısıtlı cihazda kısıtlamayı bildiren kısa bir ileti
                  gösterilir; ileti kısıtlamanın nedenini içermez.
                </li>
                <li>
                  Erişim geri verildiğinde, onunla birlikte kurulan cihaz
                  kısıtlaması da kendiliğinden kalkar; olay kayıtta kalır.
                </li>
              </ul>
            </section>

            <section
              className="mds-reading"
              id="hesap-kapatma"
              aria-labelledby="s9"
            >
              <h2 className="mds-h3" id="s9">
                9. Hesabın kapatılması
              </h2>
              <p>
                Hesap sahibi, hesabının kapatılmasını isteyebilir:{" "}
                {legal.accountDeletionPath}. Hesap kapatıldığında hesaba bağlı
                erişimler sona erer.
              </p>
              <p>
                Hesaba bağlı verilerin silinmesini isteme hakkı ve başvuru yolu{" "}
                <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nin 7.
                bölümünde yazılıdır. Hesap kapatılsa da erişimin kaldırılmasına
                ilişkin kayıtlar {legal.retentionPeriod} boyunca saklanabilir.
              </p>
            </section>

            <section
              className="mds-reading"
              id="degisiklikler"
              aria-labelledby="s10"
            >
              <h2 className="mds-h3" id="s10">
                10. Değişiklikler
              </h2>
              <p>
                Bu şartlar değişebilir. Güncel metin bu sayfada yayımlanır ve
                sayfanın başındaki son güncelleme tarihi değişir. Esaslı bir
                değişiklikte girişte şartların yeniden kabul edilmesi
                istenebilir.
              </p>
            </section>

            <section
              className="mds-reading"
              id="iletisim"
              aria-labelledby="s11"
            >
              <h2 className="mds-h3" id="s11">
                11. İletişim
              </h2>
              <p>
                Bu şartlara ilişkin sorular ve bildirimler{" "}
                <a href="/iletisim">İletişim</a> sayfasındaki formla ya da
                aşağıdaki adrese iletilebilir.
              </p>
              <dl className="grid gap-y-2 gap-x-6 items-baseline grid-cols-[max-content_minmax(0,1fr)]">
                <dt className="mds-label">Unvan</dt>
                <dd>{legal.controllerTitle}</dd>
                <dt className="mds-label">Adres</dt>
                <dd>{legal.address}</dd>
                <dt className="mds-label">E-posta</dt>
                <dd>{legal.supportEmail}</dd>
              </dl>
            </section>
          </article>
        </div>
      </main>
      <SiteFooter current="/kullanim-sartlari" />
    </>
  );
}
