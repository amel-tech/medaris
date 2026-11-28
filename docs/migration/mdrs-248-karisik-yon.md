# MDRS-248: Arapçayla başlayıp Türkçe süren metnin yönü

## Belirti

Talebe notu `إِيَّاكَ نَعْبُدُ: "iyyâke" neden başta geliyor?` sağa yaslı ve sağdan sola çiziliyordu; Türkçe kısım ters okunuyordu (`?iyyâke" neden başta geliyor"`). #471'deki hadis örneği (`قَالَ رَسُولُ اللَّهِ ﷺ: «…» — bu hadisin konusu nedir?`) de aynıydı.

## Kök neden

Paragrafın yönü metnin ilk güçlü harfinden seçiliyordu. `dir="auto"` bunu yapar; `arabicTextProps` da ilk harfi Arapça olan her metne (`startsArabic`) `dir="rtl"` veriyordu. #471'deki `mixedDir` gösterim bileşenlerinde (`ArabicText`) bu iki örneği zaten soldan sağa çiziyordu, ama bir sezgiydi: Arapçayla başlayıp Arapçayla biten ve çoğu Arapça olan karışık metni sağdan sola çiziyordu. `dir="auto"` ve `textProps` kullanan yerler (tedris'te not panelinin metin kutusu, nazar'da cevap kutusu, editörün metin alanları, celse gündemi ve kaynağı, nazar sonuç sayfası) ilk harfe göre çizmeye devam ediyordu. Yerel kopyada görülen: tedris not panelinde kayıtlı not `?kelimesinin i'râbı nedir «زَيْدٌ»` diye ters görünüyordu.

## Kural (tek yer: `libs/tokens/arabic.js`)

- `paragraphDir(text, uiDir)`: metinde Latin harf varsa arayüzün yönü (tr/en → ltr, ar → rtl); Latin harf olmayan, yalnız Arapça metin → rtl. `uiDir` verilmezse yalnız Arapça olmayan metne yön yazılmaz; eleman sayfanın yönünü alır, onu da `<html dir>` arayüz dilinden kurar.
- `arabicTextProps`: Arapça blok (lang="ar" dir="rtl", Naskh, ölçek, harekeli satır aralığı) yalnız Latin harf içermeyen metne verilir (`isArabicOnly`). Karışık ya da Latin metin arayüzün yönünü alır; `dir="auto"` artık verilmez.
- Karışık metnin Arapça parçaları `arabicRuns` ile kendi izole `dir="rtl"` elemanında kalır; #471'in parantez ve tırnak kuralı değişmedi.
- `mixedDir` kaldırıldı; nazar'daki `boxDir` yerine `paragraphDir` kullanılıyor.

Kullanan yerler: iki uygulamanın `ArabicText`'i (soru, şık, sonuç kartı, not, Notlarım, nazar talebe notları ve cevap), nazar editör satırı, yayın önizlemesi, talebe cevap sayfası, sonuç sayfası (soru metni ve şık satırları), sıfırıncı soru bölümü, tedris not panelinin metin kutusu, celse gündemi ve kaynağı. Metin kutularında yazarken de aynı kural geçerli: yalnız Arapça yazılırsa rtl, Latin harf girince arayüzün yönü.

## Doğrulandı

- Birim testleri (`libs/tokens/test/arabic.spec.ts`): Arapça başlayan karışık metin → ltr + rtl izole parça; Türkçe başlayan → ltr; yalnız Arapça → rtl; ar arayüzünde karışık → rtl taban.
- Uygulama testleri güncellendi: karışık metnin kutusunda artık `dir` yok (sayfanınkini alır).
- Playwright ÖNCE/SONRA (yerel kopya veritabanı, Türkçe arayüz): nazar soru satırları ve talebe notları, tedris soru kartı, not paneli, sonuç sayfası, Notlarım. Üç örnek: yukarıdaki iki metin ve `«زَيْدٌ» kelimesinin i'râbı nedir?`.

## Doğrulanamadı / sınır

- Arapça arayüz: iki uygulamada da `ar` kapalı (`LOCALES = ["tr"]`), o yüzden rtl taban yalnız birim testiyle doğrulandı, ekranda görülmedi.
- Düz metin kutusu (textarea) parça ayıramaz: Türkçe çerçevede hadisin kapanış `»` işareti Arapça bloğun dışında, Türkçe tarafında çizilir. Gösterimde (`ArabicText`) sorun yok; yalnız yazma alanında.
- Başlıklar, ders adı, set adı gibi soru dışı metinlerde `dir="auto"` olduğu gibi bırakıldı.
