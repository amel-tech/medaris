# Medrese günlüğü

Haftada dört gün medrese eğitimi alıyoruz. Derste çıkan her ihtiyaç Medaris'e
bir geliştirme olarak dönüyor. Bu klasör o sürecin kaydıdır: her ders için
derste işlenen sayfa, o sayfanın Medaris'e hangi yollarla girilebildiği, girerken
çıkan bulgular ve çekilen videoların başlıkları.

Kurallar:

- Her ders bu dosyaya yeni bir bölüm olarak eklenir; eski bölümler silinmez.
- Buradaki her sayı ve her ekran etiketi ölçülmüş ya da ekrandan okunmuştur.
  Ölçülemeyen şey "Doğrulanmadı" diye yazılır, boş bırakılmaz.
- Videolar depoya konmaz; pull request gövdesine yüklenir, burada yalnız
  başlıkları durur.
- Sarf motoru (`libs/sarf`) yalnız sülâsî mücerred **sâlim** kökleri ve altı
  bâbı üretir. İlletli, hemzeli, muzaaf kök ve mezîd bâb motorla girilemez; böyle
  bir sayfa geldiğinde bu açıkça yazılır.

## Ders 1: Emsile'nin 24 sîgası

| | |
| --- | --- |
| Kayıt tarihi | 2026-11-25 |
| Figma sayfası | Emsile çalışmasının ilk sayfası (24 sîga). **Doğrulanmadı:** bu kayıt yazılırken Figma bağlantısı elde değildi; sayfa okunmadı. |
| Kök, bâb | ن ص ر, birinci bâb (Nasara – yensuru), Türkçe mastar `yardım etmek`. Figma sayfası başka bir kök kullanıyorsa bu bölüm düzeltilir. |
| Medaris'teki yer | Argedik Köşkü, ders "Emsile", celse "Ders 1: Mâzî" (yerel geliştirme verisi) |

### Bu sayfayı girmenin beş yolu

Beşi de yerelde baştan sona denendi (Nazır'da giriş, Tedris'te talebe görünümü).

| # | Yol | Ne girilir | Talebe nerede görür | Ne eksik kalır |
| --- | --- | --- | --- | --- |
| 1 | Nazır › Emsile › **Sarf tablosu** › **Derse ekle** | Kök, Bâb, Türkçe mastar. 24 sîga ve her birinin çekimi formülle üretilir. | Tedris › Emsile › **Sarf** sekmesi | Yalnız sâlim kök ve altı bâb. Masdar, İsm-i âlet ve Mübâlağa ism-i fâil "Taslak" işaretiyle gelir; müderris doğrular. |
| 2 | Nazır › Emsile › Celseler › **Tahta** › **Sarf tablosu ekle** › **Tahtaya ekle** | Kök, Sîga, Binâ seçilir; çekim tahtaya düzenlenebilir metin olarak gelir. Ya da sayfanın görüntüsü tuvale bırakılır. | Tedris › celse sayfası › **Ders tahtası** (salt okunur) | Her dokunuşta tek sîganın çekimi gelir; 24 sîgalık liste tek seferde gelmez. Görsel, dosya deposu kurulu olmayan ortamda kaydedilmez (aşağıda). |
| 3 | Nazır › Emsile › **Lügat** › **Terim ekle** | Her sîga için Terim, Arapça yazılışı, Lügat manası, Istılah manası, Örnek; hepsi elle. | Tedris › Emsile › **Lügat** sekmesi | 24 sîga 24 ayrı kayıttır. Çekim tablosu yoktur; yalnız sîganın adı ve tanımı durur. |
| 4 | Nazır › Emsile › Celseler › **Ders notu** | Markdown metni, elle ya da yapıştırarak (en çok 20000 karakter). | Tedris › celse sayfası › **Ders notu** | Markdown tablo çizmez (`\| a \| b \|` düz satır olarak kalır); numaralı liste çizer. Çekim yoktur. |
| 5 | Nazır › Emsile › **Ders destesi** › **Deste aç**, sonra **Sarf tablosu** › **Desteye ekle** › **24 sîgayı desteye ekle** | Bir deste başlığı; 24 sîga tek dokunuşla 24 ezber kartı olur. | Tedris › Emsile › **Ders destesi** sekmesi › **Çalış** | Okuma tablosu değil, ezber kartıdır. Önce bir deste açılmış olmalıdır. |

Öneri: sayfanın kendisi için **1. yol** (tek girişle 24 sîga ve bütün çekimler,
elle yazım yok). Ezber için üstüne **5. yol**. 3. ve 4. yol sîgaların
tanımını ve müderrisin açıklamasını taşır; sayfanın yerini tutmaz.

### Motorun ürettiği 24 sîga

Nazır'daki Sarf tablosu ekranından okundu (ن ص ر, Nasara – yensuru, `yardım etmek`).

| # | Sîga | Arapça | Türkçe |
| --- | --- | --- | --- |
| 1 | Mâzî | نَصَرَ | yardım etti |
| 2 | Muzâri | يَنْصُرُ | yardım eder |
| 3 | Masdar (Taslak) | نَصْرًا | yardım etmek |
| 4 | İsm-i fâil | نَاصِرٌ | yardım edici |
| 5 | İsm-i mef'ûl | مَنْصُورٌ | yardım olunmuş |
| 6 | Cehd-i mutlak | لَمْ يَنْصُرْ | yardım etmedi |
| 7 | Cehd-i müstağrak | لَمَّا يَنْصُرْ | henüz yardım etmedi |
| 8 | Nefy-i hâl | مَا يَنْصُرُ | yardım etmiyor |
| 9 | Nefy-i istikbâl | لَا يَنْصُرُ | yardım etmez |
| 10 | Te'kîd-i nefy-i istikbâl | لَنْ يَنْصُرَ | elbette yardım etmeyecek |
| 11 | Emr-i gâib | لِيَنْصُرْ | yardım etsin |
| 12 | Nehy-i gâib | لَا يَنْصُرْ | yardım etmesin |
| 13 | Emr-i hâzır | اُنْصُرْ | yardım et |
| 14 | Nehy-i hâzır | لَا تَنْصُرْ | yardım etme |
| 15 | İsm-i zaman | مَنْصَرٌ | yardım edecek zaman |
| 16 | İsm-i mekân | مَنْصَرٌ | yardım edecek yer |
| 17 | İsm-i âlet (Taslak) | مِنْصَرٌ | yardım edecek alet |
| 18 | Masdar binâ-i merre | نَصْرَةً | bir kere yardım etmek |
| 19 | Masdar binâ-i nev' | نِصْرَةً | bir çeşit yardım etmek |
| 20 | İsm-i tasğîr | نُصَيْرٌ | azıcık yardım edici |
| 21 | İsm-i mensûb | نَصْرِيٌّ | yardım etmeye mensup |
| 22 | Mübâlağa ism-i fâil (Taslak) | نَصَّارٌ | çok yardım edici |
| 23 | İsm-i tafdîl | أَنْصَرُ | daha çok yardım edici |
| 24 | Fi'l-i taaccüb | مَا أَنْصَرَهُ وَأَنْصِرْ بِهِ | ne acayip yardım etti |

**Figma ile tek tek karşılaştırma: Doğrulanmadı.** Figma sayfası okunamadığı için
hareke, anlam ve sıra farkı aranamadı. Sayfa okununca bu tabloya bir "Figma"
sütunu eklenir ve farklar aşağıdaki bulgulara yazılır.

### Bulgular

1. **Düzeltildi.** Boş bir tahtaya eklenen ilk sarf tablosunda Türkçe anlamlar
   kırpılıyordu ("O (erkek) yardım e"), tahtada da talebenin celse sayfasında da.
   Tuval el yazısı yazı tipini ilk kullanımda indiriyor ve metni eklendiği anda
   ölçüyor; ölçü yedek yazı tipiyle alınıyordu. Yazı tipi gelince metinler
   yeniden ölçülüyor. Aynı anlamın genişliği 118,56'dan 143,91'e çıktı.
   (`apps/nazar/features/board`)
2. **Beklenen, kod hatası değil.** Tahtaya bırakılan görsel yerelde
   kaydedilmiyor: `POST /api/files/lessons/<celse>/board/files` 503
   `STORAGE_NOT_CONFIGURED` dönüyor, çünkü yerelde `BUNNY_STORAGE_*` anahtarları
   yok. Ekran bunu açıkça söylüyor: "Dosya deposuna ulaşılamıyor; görsel
   kaydedilemedi. Daha sonra yeniden deneyin." Deposu kurulu bir ortamda
   kaydedildiği **doğrulanmadı**.
3. **Açık, bu çalışmanın dışında.** Nazır › Ders destesi sayfası, derste hiç
   deste yokken konsola hydration hatası yazıyor: boş durum bileşeni bir `<p>`
   çiziyor, içine iki `<p>` daha konuyor
   (`apps/nazar/features/decks/components/decks-page.tsx`). Sayfa çalışıyor.
   Emsile araçlarından önce de vardı; burada düzeltilmedi.
4. **Bilgi.** Ders notunun Markdown'ı tablo çizmiyor. 24 sîgayı tablo olarak
   yazmak isteyen müderris düz satırlar görür; numaralı liste kullanmak gerekir.

### Videolar

Her yol için ayrı video: solda Figma sayfası, sağda Medaris'te giriş. Beş çekim
betiği yer tutucu bir sol panelle prova edildi ve beşi de sonuna kadar çalıştı.
**Yayımlanacak videolar çekilmedi:** sol panel gerçek Figma görüntüsünü
bekliyor.

| # | Başlık | Durum |
| --- | --- | --- |
| 1 | Sarf tablosu | Prova edildi, çekilmedi |
| 2 | Tahta | Prova edildi, çekilmedi |
| 3 | Lügat | Prova edildi, çekilmedi |
| 4 | Ders notu | Prova edildi, çekilmedi |
| 5 | Ders destesi | Prova edildi, çekilmedi |
