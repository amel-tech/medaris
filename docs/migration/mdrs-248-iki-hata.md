# MDRS-248: video çekiminde bulunan iki hata

Çalışma soruları videosu çekilirken iki hata görüldü. İkisi de bu PR'da düzeltildi.

## 1. Vazgeç'ten sonra "Yayınla" kapalı kalıyordu (nazar)

Belirti: Cmd/Ctrl+Enter ile soru kaydedilince yeni boş form açılıyor. O formda "Vazgeç"e basılınca form kapanıyor, ama "Yayınla" sayfa yenilenene kadar kapalı kalıyor ve "Açık soruyu kaydedin ya da vazgeçin; sonra yayınlayın." yazıyordu.

Kök neden: boş yeni soru `removeQuestion` ile listeden siliniyor, ama `editing` state'i hâlâ silinen sorunun anahtarını tutuyordu. `holding` (`editing !== null && editing !== blank?.key`) bu yüzden doğru kalıyordu. Aynı bayat değer sayfanın yeni okumayı almasını da engelliyordu (`exam-editor.tsx`'teki yenileme etkisi aynı koşulu okur). Cmd+Enter şart değildi: "Soru ekle" ile açılıp hemen "Vazgeç"lenen boş form da aynı durumu bırakıyordu.

Düzeltme: `removeQuestion`, açık olan soruyu siliyorsa `editing`'i `null` yapar (`setEditing((open) => (open === key ? null : open))`). Fonksiyonel güncelleme kullanıldı; böylece "Düzenle"deki `leaveBlank(); setEditing(q.key)` sırası yine `q.key` ile biter.

Benzer yollar kontrol edildi:

- Satırdaki "Sil": yalnız form açık olmayan satırda görünür. Silinen soru açık soru değilse `editing` değişmez.
- "Değişiklikleri bırak": `onConfirm` zaten `setEditing(null)` çağırıp ardından bekleyen işi yapıyor. Doğru çalışıyordu, test eklendi.
- "Yeniden dene" (`onRetry`): `leaveBlank` ile boş form silinir, `saveQuestion` `editing`'i zaten `null` yapar.

Testler (`apps/nazar/test/exam-publish.spec.tsx`):

- Cmd+Enter → boş form → Vazgeç → "Yayınla"/"Zamanla" açık, bekleme notu yok.
- "Soru ekle" → Vazgeç; "Düzenle" → değişiklik → "Soru ekle" → "Değişiklikleri bırak" → Vazgeç → düğme açık.

İki test de düzeltme geri alınınca kırmızı, düzeltmeyle yeşil (yerelde denendi).

## 2. Karışık Türkçe + Arapça metinde parantez ve tırnaklar (tedris, nazar)

Belirti: Türkçe bir soru metninde Arapça bir kelime ya da hadis « », ( ) ya da ﴿ ﴾ içinde geçince işaretler yanlış yere düşüyordu. Örnekler:

- `«زَيْدٌ» kelimesinin i'râbı nedir?`: açılış « Türkçe parçada, kapanış » Arapça parçada kalıyordu. İkisi de Arapça kelimenin sol tarafında görünüyordu.
- `قَالَ رَسُولُ اللَّهِ ﷺ: «…» — bu hadisin konusu nedir?`: tire Arapça parçaya giriyordu ve satırın en soluna düşüyordu. nazar'da metnin ilk harfi Arapça olduğu için metnin tamamı (Türkçesi de) tek bir RTL blok olarak çiziliyordu.
- `Niyet («النِّيَّة»)`, `«مَرْفُوعٌ» (merfû)`: parantez ve tırnaklar karışıyordu.
- `Doğru yol: ﴿الصِّرَاطَ الْمُسْتَقِيمَ﴾`: tedris'te çoğunluğu Arapça ve Arapçayla bittiği için bütün şık RTL çiziliyordu (`:Doğru yol`).

Karar ve düzeltme (`libs/tokens/arabic.js`, `@medaris/tokens/arabic`):

- `arabicRuns` yeniden yazıldı. Bir Arapça parça, ilk Arapça harften son Arapça harfe kadar, aradakilerle birlikte (boşluklar, ﷺ'den sonraki `:`, içteki «…») tek parçadır. Buna şunlar eklenir:
  - önündeki açılış işaretleri: `(`, `[`, `{`, `«`, `‹`, `“`, `‘`. Arada boşluk olabilir. Düz tırnak (`"`, `'`) yalnız parçaya bitişikse eklenir, çünkü `Fâtiha'daki` örneğindeki gibi kesme işareti de olabilir.
  - parçanın açık bıraktığı çiftleri kapatan, hemen ardından gelen kapanış işaretleri.
  - ﴿ ﴾'nin `Script_Extensions` değeri Arapçadır, bu yüzden zaten parçanın içindedir.
- Parça kendi elemanında `dir="rtl"` ve `unicode-bidi: isolate` ile çizilir (`arabicTextProps`). Böylece `( ) [ ] « » ‹ ›` tarayıcının bidi aynalamasıyla doğru yöne döner. ﴿ ﴾ aynalanmaz; Kur'an kullanımındaki mantıksal sırayla RTL bağlamda doğru görünür.
- Arapça parçanın ardından gelen boşluklar ve Latin noktalama (`?`, `.`, `,`, `—`) Türkçe cümlede kalır. Bu, verilen kararın tek istisnasıdır: parçanın içine girselerdi RTL parçanın soluna düşerlerdi (`Fiil: فَعَلَ?` → `Fiil: ?فعل`). Arapça noktalama (`؟`, `،`) zaten Arapça yazı sistemindedir ve parçanın içinde kalır.
- `mixedDir` ve `isMixed` tedris'ten ortak modüle taşındı. `mixedDir` artık RTL yalnız metin Arapçayla başlayıp Arapçayla bitiyorsa ve çoğunluğu Arapçaysa döner (`ما معنى X في الآية`). Türkçe çerçeve her durumda LTR kalır.
- nazar: `ArabicText` artık tedris gibi çalışır. Karışık metin çerçevesinin yönünü alır ve Arapça parçaları ayrı çizer. Satırın ve yayın önizlemesinin kutusu `boxDir` ile yön alır. Talebe cevapları sayfası (`talebe-answers-view.tsx`) da `ArabicText` kullanır.
- Yalnız Arapça olan metin (Latin harf yoksa) eskisi gibi tek Arapça blok olarak çizilir. Bu davranış değişmedi; önizlemedeki 6. soru ÖNCE/SONRA görüntüsünde aynıdır.

Testler: `libs/tokens/test/arabic.spec.ts` (üç örnek; ( ) [ ] ‹ › “ ” ve düz tırnak; kesme işareti; Türkçede açılıp Türkçede kapanan çift; iç içe çiftler; eşleşmeyen kapanış; sondaki Latin noktalama; yalnız Arapça metin; `isMixed`, `mixedDir`). `apps/nazar/test/exam-editor.spec.tsx` (hadisle başlayan Türkçe soru satırı LTR, hadis tek Arapça parça). `apps/nazar/test/exam-answers.spec.tsx` (güncellendi).

## Doğrulananlar

- Gate: `typecheck`, `test`, `build`, `lint`, `module-boundaries` (PR gövdesindeki çıktılar).
- `delurio check graphs --strict --baseline graphs/delurio.baseline.sarif` yerelde yeşil. `exam-editor.tsx` ve `talebe-answers-view.tsx` satır kaydığı için `graphs/**` ve `graphs/FINDINGS.md` içindeki satır referansları yeni satırlara taşındı. `nazar/exams/edit/ui.yaml` ve `nazar/exams/results/ui.yaml` içindeki `arabic-runs` kuralı yeni davranışa göre yazıldı.
- Ekran görüntüleri (Playwright, yerel stack, kopya veritabanı) ÖNCE/SONRA: tedris soru kartı (üç örnek), tedris sonuç sayfası, nazar editör satırları, nazar yayınlanmış set listesi.

## Doğrulanamayanlar

- Bulgu 1 tarayıcıda ekran görüntüsüyle denenmedi; birim testleriyle doğrulandı.
- Sağdan sola arayüz dilinde (ar) görünüm denetlenmedi.
- Elle yazılan metinlerin form alanları (`textarea`, şık `input`'u) eskisi gibi tek yön alır. Bir giriş alanının içinde parçalara ayrı yön verilemez.

## Takip

- nazar editörü: başarısız bir sorudaki "Yeniden dene", açık olan başka bir sorunun formunu "Değişiklikleri bırak" sorusunu sormadan kapatır (`saveQuestion` her zaman `setEditing(null)` çağırır). Bu, bu PR'dan önce de vardı ve kod incelemesinde bulundu; bu PR'ın kapsamı dışında bırakıldı.
