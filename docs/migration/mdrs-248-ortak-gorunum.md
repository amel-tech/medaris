# MDRS-248 — Ortak soru görünümü, iki sütunlu editör, soru üstte şıklar altta

Sahibin geri bildirimi (28 Kasım 2026, #480 ve #481'den sonra):

1. "Soruları oluşturan kişi talebenin ekranda gördüğü gibi görmesi gerekiyordu; talebenin gördüğü arayüz ile hocaların gördüğü arayüz aynı değil. Ayrıca sorular sağdaki sütunda sadece akordiyon mantığında soruları tek satırlık cümleyle göstererek görünmeli. Sığmayan kısmını … şeklinde kısaltabilirsin. Sol tarafta da hazırladığı sorular olmalı."
2. "Standartlara göre soru yukarıda, şıklar sorunun altında olmaz mı? … Küçük ekransa belirttiğin şekilde yapabilir ama ekrana sığıyorsa soru yukarıda, şık aşağıda olmalı."

## Ne değişti

### Ortak bileşen: `@medaris/ui/mds/question-sheet`

- `libs/ui/src/mds/question-sheet.tsx`: `QuestionSheet` (numara satırı, metin, şık karoları, altına konan düğmeler), `QuestionOptions`, `ScrollPane`, `optionLetter`, `optionsLayout`, `SHORT_OPTION`. Hepsi tedris'in `question-parts.tsx` dosyasından taşındı. `question-parts.tsx` bunları yeniden dışa verir, tedris'teki çağıranlar değişmedi.
- `libs/ui/src/mds/arabic-text.tsx`: tedris'in `ArabicText`'i (boyut ve ağırlık alan sürüm). `apps/tedris/.../arabic-text.tsx` artık yalnız onu yeniden dışa verir.
- `libs/ui/src/styles/mds/question.css`: karoların, harf rozetinin ve soru metninin CSS'i `apps/tedris/app/tedris.css`'ten taşındı. `medaris.css` ve `medaris-components.css` onu katmansız içe alır, tedris.css'teki gibi. Yeni kurallar: hocanın ✓ işareti (`.take-option__correct`), salt okunur karolar (`[data-readonly]`), boş metin. Kart dolgusu `.take-body` üzerinde talebeninkine (24px, telefonda 16px) sabitlendi. Nazar `data-density="compact"` olduğu için kart orada 16px'ti.
- `libs/ui` neden: bileşen React ve DOM kullanır, iki tüketicisi de web uygulaması. `libs/ui` `scope:ui` + `platform:web` taşır, iki uygulama da ona zaten bağlı. `scope:shared` bir lib'e React bileşeni koymak AGENTS.md'deki platform-nötr kuralını bozardı. Uygulamalar arası import yok.

### Tedris çözme ekranı (çalışma soruları ve sınav)

- `practice-take.tsx` ve `exam-take.tsx` soruyu `QuestionSheet` ile çizer.
- Masaüstünde (≥1024px) varsayılan düzen **soru üstte, şıklar altta, düğmeler kartın dibinde**. Kısa soruda aradaki boşluk şıklarla düğmeler arasında kalır.
- Yalnız bu düzen pencereye sığmıyorsa sheet kendini ikiye böler: solda soru kendi içinde kayar, sağda şıklar. Karar ölçülerek verilir: `QuestionSheet`'in `fit` özelliği sheet'i önce `stack` yapar. Akıştaki son satırın altı kartın iç altını geçiyorsa `split` yazar (`data-layout`, `overflows()`). Üstüne açılan şeyler (not paneli, tooltip) akış dışında olduğu için hesaba girmez. Kartın kendisi kaymaz (`overflow` görünür), bu yüzden not paneli kesilmez; yalnız `split`'teki iki bölme kayar. Soru, pencere boyu, A−/A+ adımı ya da geç yüklenen bir yazı tipi bir boyutu değiştirdiğinde (`ResizeObserver`, `matchMedia`) yeniden ölçer. Değer React dışında DOM'a yazılır, ölçüm sayfayı yeniden çizdirmez.
- 1024px altında düzen eskisi gibi: tek sütun, düğmeler ekranın dibine yapışık, soru listesi sayfanın sonunda. 100dvh, ince üst çubuk ve "Sorular" çekmecesi aynı kaldı.

### Nazar soru editörü ve yayındaki set/sınav

- Yeni `apps/nazar/features/online-exams/components/question-board.tsx`. Masaüstünde (≥1024px) iki sütun var. Solda her soru talebenin gördüğü `QuestionSheet` ile çizilir, salt okunurdur. Düzenlenen sorunun yerinde formu açılır. Sağda her soru tek satırdır: "3. soru · metnin başı…". Metnin satırları birleştirilir ve taşan kısım `text-overflow: ellipsis` ile kesilir. Liste ekranda sabit kalır (`sticky`).
- Satıra tıklayınca soru sola kaydırılır ve odaklanır. Formu açıksa formun metin alanı odaklanır. Hem satır hem kart işaretlenir: satırda `aria-current`, kartta marka halkası. Halka eksik bir sorunun kırmızısının üstünde de görünür. Satırdaki ünlem ya da kalem formu açar ve oraya kaydırır. Eksik bir sorunun satırı ve kartı kırmızımsıdır. Ünlem ve tooltip satırda da kartta da durur. Not, düzenle ve sil ikonları kartın numara satırının ucundadır, talebenin not ikonunun yerinde. "Soru ekle" hem soruların altında hem satır listesinin altındadır.
- Hocaya özel ek katman: doğru şıkta yeşil ✓, adı "Doğru". Numaranın yanında konular, ünlem ve "Kaydediliyor…" durur. Bunların dışında kart talebeninkiyle aynıdır.
- Şıklar tıklanmaz. Karolar `inert` bir kabın içindedir: sekme sırasında durmazlar, ekran okuyucu da onları duymaz. Aynı şıkları ve doğru olanı görünmeyen düz bir liste söyler.
- Kısa şıkların iki sütunu, şık bölmesi 30rem'den darsa tek sütuna iner (`@container`). Bu kural tedris.css'ten `question.css`'e taşındı, iki uygulamada da aynı eşik geçerli.
- Telefonda tek sütun var: yalnız sorular görünür, satır listesi gizlenir.
- `exam-publish.tsx` (yayındaki ya da kilitli set/sınav) aynı `QuestionsBoard` + `HocaSheet` düzenini kullanır. Daha önce düz bir `<ol type="A">` listesiydi.
- **Yorum (orkestratör):** "akordiyon mantığında" sözü, sağdaki tek satırlık ve tıklanınca soruyu açıp işaretleyen bir liste olarak yorumlandı. Sol sütunda "hazırladığı sorular" çoğul olduğu için seçili tek soru değil bütün sorular gösterilir. Seçilen soru kaydırılıp işaretlenir.
- Yeni nazar anahtarları (tr/en/ar): `OnlineExams.multiHint`, `OnlineExams.questionPane`, `OnlineExams.questionRows`.

### Konu listesinde Esc (#480'den kalan hata)

- `libs/ui/src/mds/combobox.tsx`: Base UI 1.8 `Combobox`, liste kapalıyken Esc'e basılınca bütün seçimi temizliyor (`ComboboxInput`: `!mounted && key === 'Escape'` → `setSelectedValue([])`). `onValueChange` artık `reason === "escape-key"` olan değişikliği almıyor. Esc yalnız listeyi kapatır. Çip kendi × düğmesiyle ya da Backspace ile tek tek silinir.
- Test: `libs/ui/test/combobox.spec.tsx` "closes the list on Escape and keeps every chosen value". Düzeltme geri alınınca bu test `expected '' to be 't3,t7'` hatasıyla düştü, düzeltmeyle geçiyor.

### Graflar

- `graphs/tedris/exams/take` ve `graphs/nazar/exams/{edit,publish}` içindeki `source:` satırları kodun yeni satırlarına kaydırıldı. Taşınan parçalar (`ScrollPane`, karolar, `LacksMark`) yeni dosyalarını gösterir.
- `nazar.exams.edit` içinde #480'den önce bayatlamış bazı satırlar vardı: `settings*`, `title*`, `duration*`, `instructions*`, `addOption`, `scoringAll`, `topicNumbers*`. Bunlar başka satırları gösteriyordu. Anahtar metinleri arandı ve doğru satırlara çekildi. `topicNumbersHelp/Error` anahtarları kodda artık yok. Konu seçimine (`MultiCombobox`) bağlandılar.

## Doğrulandı

- Birim testleri: `apps/nazar` 1981, `apps/tedris` 1451, `libs/ui` 265 test yeşil (vitest). Yeni testler:
  - `libs/ui/test/question-sheet.spec.tsx`: çizim, sığınca `stack`, sığmayınca masaüstünde `split`, 1024 altında hep `stack`, `fit` olmadan ölçüm yok, hocanın ✓ işareti ve salt okunurluk, iki CSS girişinin de `question.css`'i alması.
  - `apps/nazar/test/exam-editor.spec.tsx`: talebenin sheet'iyle çizim, tek satırlık liste ve kaydırma/odak, eksik soru satırı.
  - `apps/nazar/test/exam-practice.spec.tsx`: yayındaki set.
  - `apps/tedris/test/take-desktop.spec.ts`: stack ve split CSS'i.
- `delurio check graphs --strict --baseline graphs/delurio.baseline.sarif` (0.14.0): 186 graf, 0 hata, 19 uyarı. `main` ile aynı.
- Tarayıcı (Playwright 1.63 Chromium, yerel Keycloak, kopya veritabanı `tedrisat_calisma`, "Ortak görünüm" seti): üç soru, kısa, uzun ve "Kur'an kaç cüzdür?".

| Görüntü alanı | Soru | Düzen | scrollHeight | innerHeight |
| -- | -- | -- | -- | -- |
| 1366×657 | uzun | split | 657 | 657 |
| 1366×657 | kısa («الْحَمْدُ لِلَّهِ») | stack | 657 | 657 |
| 1366×657 | cüz | stack | 657 | 657 |
| 1440×789 | uzun | stack | 789 | 789 |
| 1440×789 | kısa | stack | 789 | 789 |
| 1440×789 | cüz | stack | 789 | 789 |
| 390×844 | uzun / kısa / cüz | stack (telefon, sayfa kayar) | 1442 / 1073 / 1057 | 844 |

  Masaüstünde sayfa hiçbir soruda kaymaz. Uzun soru 1440×789'da üst üste sığdığı için ikiye bölünmez. 1366×657'de sığmaz ve bölünür.
- Hoca ve talebe kartı aynı soru için yan yana karşılaştırıldı. Kart kenarı, köşe yarıçapı, zemin, 24px dolgu, 12px aralık, metin (16/24), "Şıklar" etiketi (14, 500), karo (dolgu 12/16, yarıçap 6, 56px yükseklik), harf rozeti ve şık metni (16/22.88) hesaplanan stillerde birebir aynı çıktı. Fark yalnız hocaya özel katmandadır: ✓, konu rozeti ve ikonlar.
- Konu listesinde Esc (yerel tarayıcı): bir konu seçili form açıldı, alana yazılıp üç kez Esc'e basıldı. Önce de sonra da "11. Fâtiha" seçili kaldı.

- Not paneli (1366×657, uzun soru, `split`): panel tamamen görünüyor. Panelin altı 539px, kartın altı 592px, `overflow: visible`, düzen `split` kaldı.
- Sonuç kartları (#481): set bitirildi, "Cevapların" ızgarası (harf rozeti, ✓, "Devamını göster") değişmeden çiziliyor.
- `/code-review` (medium): 8 bulgu, hepsi düzeltildi.
  - Not panelinin kesilmesi.
  - Ölçümün paneli sayması.
  - Ünlemin forma kaydırmaması.
  - Eksik soruda seçim izinin görünmemesi.
  - Salt okunur karoların sekme sırasında durması.
  - Dar bölmede 2×2 farkı.
  - Değişen öğenin gözlenmemesi.
  - Form açıkken odak.

## Doğrulanamadı

- Keycloak e2e (`keycloak-audience`, `keycloak-theme` e-posta) bu makinede `main`'de de düşüyor. Değişiklikle ilgisi yok.
- Talebe ekranında şıkların sırası karışık geliyor, hoca kendi yazdığı sırayı görüyor. Bu, çalışma setinin mevcut davranışı; bu iş değiştirmedi. Aynı sorunun harfleri iki ekranda farklı olabilir.
- Ekran okuyucu (VoiceOver/NVDA), Safari ve Firefox denenmedi. Koyu tema görüntüsü alınmadı.
