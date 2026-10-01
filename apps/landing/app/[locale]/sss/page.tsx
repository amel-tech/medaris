import { setRequestLocale } from "next-intl/server";
import { FaqItem } from "~/components/faq-item";
import { SiteFooter } from "~/components/site-footer";
import { SiteHeader } from "~/components/site-header";
import { legal } from "~/content/legal";

export const metadata = { title: "Sık sorulan sorular · Medaris" };

// Sık sorulan sorular: canvas "Medaris Ekranları", SSS.dc.html. MDRS-151.
export default async function Page({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <>
      <SiteHeader title="Sık sorulan sorular" />
      <main className="mx-auto flex inline-full max-inline-content flex-col gap-section pbs-8 pbe-16 px-gutter max-md:pbs-5 max-md:pbe-10">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex min-inline-0 flex-col gap-2">
            <h1 className="mds-h1">Sık sorulan sorular</h1>
            <p className="mds-body">
              Medaris’te hesap açmadan önce en çok sorulanlar.
            </p>
          </div>
        </div>

        <div className="grid items-start gap-8 grid-cols-[minmax(0,1fr)_var(--layout-aside)] max-md:grid-cols-1">
          <div className="flex min-inline-0 flex-col gap-8">
            <section
              className="flex min-inline-0 flex-col gap-3"
              aria-labelledby="g1"
            >
              <h2 className="mds-h4" id="g1">
                Medaris
              </h2>
              <div className="mds-weeks">
                <FaqItem
                  id="s1"
                  number={1}
                  question="Medaris nedir?"
                  defaultOpen
                >
                  <p className="mds-body">
                    Çevrim içi bir medrese. Dersler köşklerde açılır ve
                    haftalara bölünür; her hafta müderrisle bir ya da birkaç
                    canlı celse yapılır, okunanlar ezber kartlarıyla tekrar
                    edilir.
                  </p>
                </FaqItem>
                <FaqItem id="s2" number={2} question="Köşk ve medrese nedir?">
                  <p className="mds-body">
                    Köşk, bir ilim dalına ayrılmış meclistir: Nûruosmaniye
                    Köşkü’nde Arapça dil ilimleri, Fatih Köşkü’nde fıkıh okunur.
                    Dersler köşklerde açılır.
                  </p>
                  <p className="mds-body">
                    Medrese, bir başmüderrisin yönettiği kurumdur ve kendi
                    derslerini barındırma hakkı olan köşklerde açar. Her ders
                    bir medreseye bağlı değildir.
                  </p>
                </FaqItem>
              </div>
            </section>
            <section
              className="flex min-inline-0 flex-col gap-3"
              aria-labelledby="g2"
            >
              <h2 className="mds-h4" id="g2">
                Kayıt ve dersler
              </h2>
              <div className="mds-weeks">
                <FaqItem
                  id="s3"
                  number={3}
                  question="Bir derse nasıl kaydolurum?"
                >
                  <p className="mds-body">
                    Önce hesap açın: “Kayıt ol” düğmesine basın; adınızı,
                    soyadınızı, kullanıcı adınızı, e-posta adresinizi ve
                    şifrenizi yazın ve Aydınlatma Metni’ni okuduğunuzu
                    onaylayın. Ardından e-postanıza gelen bağlantıyla adresinizi
                    doğrulayın.
                  </p>
                  <p className="mds-body">
                    Sonra dersin sayfasında “Derse kaydol” düğmesine basın.
                    Kaydı onayla alan derslerde bu düğme “Kayıt başvurusu yap”
                    olarak görünür.
                  </p>
                </FaqItem>
                <FaqItem
                  id="s4"
                  number={4}
                  question="Derse kaydım neden onay bekliyor?"
                  defaultOpen
                >
                  <p className="mds-body">
                    Bazı derslere kayıt, ders kadrosunun onayıyla olur.
                    Başvurunuz onaylanana kadar ders sayfasında “Onay bekliyor”
                    yazar ve dersin içerikleri kilitli kalır. Başvurunuzu bu
                    sürede geri çekebilirsiniz; ders kadrosu onu artık görmez ve
                    isterseniz yeniden başvurabilirsiniz. Başvurunuz
                    reddedilirse bildirim alırsınız; ders kadrosu bir gerekçe
                    yazdıysa onu da bildirimde görürsünüz.
                  </p>
                  <p className="mds-body">
                    Listelenmeyen bir köşkün derslerinde kayıt her zaman onayla
                    olur.
                  </p>
                </FaqItem>
                <FaqItem id="s5" number={5} question="Celseye nasıl katılırım?">
                  <p className="mds-body">
                    Kayıtlı olduğunuz dersin celse sayfasında, celse başlamadan
                    10 dakika önce “Celseye katıl” düğmesi görünür; toplantı
                    yeni sekmede açılır. Her celsenin toplantı bağlantısı
                    ayrıdır ve yalnız derse kayıtlı talebelere gösterilir.
                    Müderris canlı yayın yapıyorsa yayın da celse sayfasında
                    oynar.
                  </p>
                </FaqItem>
                <FaqItem
                  id="s6"
                  number={6}
                  question="Celse saatleri hangi saat dilimine göre yazılır?"
                >
                  <p className="mds-body">
                    Celse saatleri İstanbul saatiyle, tek saat olarak yazılır.
                  </p>
                  <p className="mds-body">
                    Saat diliminiz İstanbul’dan farklıysa celse davet
                    e-postasında iki saat yan yana yazılır: önce dersin saati,
                    sonra sizin saatiniz. Örneğin saat diliminiz Berlin ise
                    İstanbul’da 21:00 olan bir celse, davette 20:00 olarak da
                    yazılır.
                  </p>
                </FaqItem>
                <FaqItem
                  id="s7"
                  number={7}
                  question="Ders kayıtları kimlere açık?"
                >
                  <p className="mds-body">
                    Celselerin ders kayıtları o dersin kayıtlı talebelerine
                    açıktır. Herkese açık olarak işaretlenen ders kayıtlarını
                    ise herkes, hesap açmadan da izleyebilir.
                  </p>
                </FaqItem>
                <FaqItem id="s8" number={8} question="Deste nedir?">
                  <p className="mds-body">
                    Ezber kartlarından oluşan bir tekrar destesi: kartın önünde
                    Arapça bir kelime ya da metin, arkasında anlamı yazar.
                    Müderrisin hazırladığı ders destesini çalışabilirsiniz; kart
                    eklemek isterseniz desteyi kendi destenize kopyalarsınız.
                  </p>
                  <p className="mds-body">
                    Herkese açık desteleri hesap açmadan da çalışabilirsiniz;
                    hesapsız çalışmanın ilerlemesi kaydedilmez.
                  </p>
                </FaqItem>
              </div>
            </section>
            <section
              className="flex min-inline-0 flex-col gap-3"
              aria-labelledby="g3"
            >
              <h2 className="mds-h4" id="g3">
                Hesap
              </h2>
              <div className="mds-weeks">
                <FaqItem id="s9" number={9} question="Medaris ücretli mi?">
                  <p className="mds-body">{legal.feeInformation}</p>
                </FaqItem>
                <FaqItem
                  id="s10"
                  number={10}
                  question="Hesabımı nasıl silerim?"
                >
                  <p className="mds-body">{legal.accountDeletionPath}</p>
                  <p className="mds-body">
                    Kişisel verilerinizle ilgili haklarınız{" "}
                    <a href="/aydinlatma-metni">Aydınlatma Metni</a>’nde
                    yazılıdır.
                  </p>
                </FaqItem>
              </div>
            </section>
          </div>

          <aside className="sticky inset-bs-[calc(var(--layout-topbar)+var(--space-6))] flex flex-col gap-4 max-md:static">
            <div className="mds-card flex flex-col gap-3">
              <div className="mds-card__header">
                <h2 className="mds-card__title">Sorunuz burada yok mu?</h2>
              </div>
              <p className="mds-body-sm">
                İletişim formundan yazın; e-posta adresinize cevap verilir.
              </p>
              <a
                className="mds-btn mds-btn--regular mds-btn--outline self-start"
                href="/iletisim"
              >
                İletişime geçin
              </a>
            </div>
            <div className="mds-card flex flex-col gap-3">
              <div className="mds-card__header">
                <h2 className="mds-card__title">Kişisel verileriniz</h2>
              </div>
              <p className="mds-body-sm">
                Hangi verilerin neden işlendiği ve haklarınız Aydınlatma
                Metni’nde yazılıdır.
              </p>
              <a
                className="mds-btn mds-btn--link self-start"
                href="/aydinlatma-metni"
              >
                Aydınlatma Metni
              </a>
            </div>
          </aside>
        </div>
      </main>
      <SiteFooter current="/sss" />
    </>
  );
}
