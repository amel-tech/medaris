# live-media: rapor (ce47fce8, 25 Eki 2026)

## Akışlar ve alan
- `live-link`: Celseler'de yayın bağlantısı. 4 durum, 1265 yapılandırma, 5/5.
- `watch`: tedris izle sayfası, canlı sohbet. 7 durum, 4400, 6/6.
- `recording-link`: bağlantı yapıştırma, Düzenle, "Yayını kayıt olarak ekle". 7 durum, 46872, 6/6.
- `recording-upload`: Bunny'ye yükleme, İptal, Devam et. 12 durum, 41152, 6/6.
- `recording-encoding` (yeni, ekransız): kodlama yoklaması, duyuru, eski videonun silinmesi. 10 durum, 5400, 6/6.
- `recording-release` (yeni): "Kayıt erişimi". 6 durum, 4480, 6/6.
- `hosting-rights`: Barındırma hakları. 8 durum, 7602, 6/6.
- `domain/domain.yaml` (`medaris.live-media`): 4 varlık, 18 eylem (12 rota). 555 `source:` çapasının hepsi dolu bir satıra çıkıyor.

## Okumamın en zayıf olduğu yerler
- **Zaman yalnız bağlam.** Saat dört dilim. 24 saat ve "bu arada" durdurmada havoc'lanıyor, yani geri de dönebiliyor. Yoklamalar olay.
- **İlk odak.** Base UI'ın varsayılanı ilk sekme durağı. Bunun başlıktaki Kapat olduğunu DOM sırasından çıkardım, çalıştırmadım. Dokunmatik açılışta odak pencerenin kendisinde.
- **Toast rolleri.** Tondan çıkardım: başarı `status`, hata `alert`.
- **`staff` izleyici.** İçeriği `recording.manage` olmadan okuyan kişi (CONTENT_WORK). Bekletilen kaydı oynatamıyor; bunu koddan okudum, denemedim.
- **Aynı dosyayla devam.** Kayıt ekle ya da Düzenle'de tarayıcıda saklı yarım yüklemeye devam etme (bunny-upload.ts:331) çizilmedi.
- **LIVE-MEDIA-2 ortama bağlı.** Bulgu `.env.example`'daki "dev ve prod tek kütüphane" cümlesine dayanıyor. Gerçek dağıtımı göremedim.

## Bulgular
- **LIVE-MEDIA-1 [orta] Başarısız yeni yükleme eski videoyu da sildiriyor.**
  - Düzenle'den başlatılan yükleme FAILED olursa (İptal edilip 24 saat beklenirse ya da Bunny hata verirse) değiştirilen Bunny videosu da silinir.
  - Kayıt FAILED olduğu için görünmez; celsede hiçbir şey kalmaz.
  - Uyarı metni "yükleme bitince silinir" diyor.
  - Kod: recording.repository.ts:489-501, 653-683. Yol: replacedOld, POLL, DONE → deletingOld.
- **LIVE-MEDIA-2 [orta] Bir ortam ötekinin videosunu sildirebiliyor.**
  - Dev ve prod tek kütüphaneyi ve anahtarını paylaşıyor (bunny-stream-env.ts:19, .env.example:402).
  - Yapıştırılan oynatıcı bağlantısında yalnız kütüphane numarası denetleniyor (recording-link.ts:168); `bunny-video-used` yalnız kendi veritabanına bakıyor (recording.repository.ts:213).
  - Böyle bir bağlantı değiştirilince o video ortak kütüphaneden siliniyor (:1021).
- **LIVE-MEDIA-3 [düşük] Yanlış yayın bağlantısı bitişten sonra kaldırılamıyor.** Celse planlanan bitişini geçince Celseler (nazar ve nizam) bağlantıyı değiştirmeye ya da kaldırmaya izin vermiyor (sessions-table.tsx:444, 534). Talebe ise bağlantıyı 24 saat daha alıyor (recording.ts:206).
- **LIVE-MEDIA-4 [düşük] Reddedilen yükleme açılış saatini değiştirmiş bırakıyor.** Saat yüklemeden önce yazılıyor; yükleme reddedilse de değişmiş kalıyor ve pencere bunu söylemiyor (recording-dialog.tsx:260-310). Yol: ADD, UPLOAD, DONE, FAIL.unconfigured.
- **LIVE-MEDIA-5 [düşük] Gizlenmiş celsenin yüklemesi yeniden imzalanıyor.** Başlatma gizli celseyi reddediyor ama yeniden imzalama reddetmiyor (recording-upload.service.ts:55-56, recording.repository.ts:526). Yol: RESUME (gizlendi), UPLOAD, DONE → sending.
- **LIVE-MEDIA-6 [düşük] "Kayıt eklendi" yasaklı talebeye de gidiyor.** Bildirim bütün ENROLLED koltuklara gidiyor (course-notification.repository.ts:107); yasak koltuğu ENROLLED bırakıyor (tedrisat-role-resolver.service.ts:403).
- **LIVE-MEDIA-7 [düşük] `recording.watch_restricted` adından fazlasını açıyor.** Hiçbir rota bu izni sormuyor. Verildiğinde dersin bütün içeriğini açıyor: toplantı bağlantısı, yayın bağlantısı, tüm kayıtlar (effective-permissions.ts:201, 296).

## Eski bulgular
- **F08 sürüyor.**
  - Token anahtarı yoksa bağlantı imzasız (bunny-signature.ts:99).
  - tedris böyle bir bağlantıyı çerçevelemiyor ama "Ders kaydını aç" bağlantısı olarak veriyor (media-player.tsx:74). Yol: talebe, readyOpen, bunnyUnsigned → recordingAtHost.
  - YouTube yayınında da kural yalnız bağlantıyı kimin gördüğünü belirliyor.
- **F11 sürüyor.** Yükleme ve PATCH iptal edilmiş celseyi denetlemiyor (recording-upload.service.ts:82, recording.repository.ts:995). Yollar: EDIT, UPLOAD, DONE ve EDIT, SUBMIT, DONE.
- **F12 sürüyor.** recording.ts:160. Görevliye yalnız 24 saat dolunca bir uyarı çıkıyor.
- **F26 kısmen düzeldi.** getSession açıklaması koda uydu (lesson.controller.ts:215). Şunlar hâlâ "yalnız canlıyken" diyor: live-stream.controller.ts:58, nazar.json:1374 ve nizam.json:3000'deki formHelp. Yol: within24h → playStream.
- **F27 sürüyor.** Ayrıca geçmiş bir açılış saatini de yalnız arayüz reddediyor (recording-write.dto.ts:133).

## delurio-graph/0'ın anlatamadıkları
- **Bileşenler:** iframe, dosya girişi, ilerleme çubuğu, Switch, Tabs, Select, tarih-saat alanı ve toast yok; en yakın bileşenle çizildi.
- **Süreler:** 60 sn yoklama, 10 sn yenileme ve 24 saat yalnız olay ya da havoc olarak var.
- **Arka plan süreçleri:** bir ekran akışının yanında `starts` ile başlatılabiliyor ama ona veri taşınamıyor.
- **Bozulan değişmezler:** flow.yaml'da "bilinen bozuk" diye tutulamıyor; yolları yalnız bu raporda.
- **Sunucu denetimlerinin sırası:** yalnız birbirini dışlayan koşullarla yazılabiliyor.
- **İki uygulamada aynı form:** nazar ve nizam Celseler'i tek akışta iki ekranla anlatılamıyor.
- **Alan ve çapalar:** domain denetlenmiyor, `source:` doğrulanmıyor.

## Kapsam
- **Kapsanan rotalar:** live-stream (2), recording (3), recording-upload (2), hosting (3), getSession ve listRecordings.
- **Kapsanan yoklamalar:** iki yoklama da (kodlama ve duyuru).
- **Kapsanan ekranlar:** nazar Celseler (yayın ve Kayıt erişimi), nazar Ders kayıtları (iki sekme ve erişim penceresi), tedris izle, nizam Barındırma hakları.
- **Dışarıda bırakılanlar:**
  - nizam Celseler: aynı rotayı çağırıyor.
  - tedris kayıtlar sekmesi ve celse kartları: okuma kuralları aynı.
  - Soru ve not yazma: learning alanının işi.
  - Arşivden geri alma: platform-admin alanının işi.
- **Cinsiyet:** Bu alanda yüz yüze buluşma yok, cinsiyet de tutulmuyor. Canlı sohbet YouTube'un kendi sohbeti ve çevrimiçi.
