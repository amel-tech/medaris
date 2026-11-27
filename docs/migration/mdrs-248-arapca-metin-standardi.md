# MDRS-248 — Arapça metin standardı ve çalışma soruları temeli

Bu PR, hoca (nazar) ve talebe (tedris) çalışma soruları ekranlarının üstüne kurulacağı üç temel değişikliği içerir.

## 1. Çalışma setinde konu zorunlu değil

`lacksOf(q, kind)` (`apps/tedrisat/src/online-exam/domain/online-exam.ts`) artık türü de alır ve eksik konuyu yalnız `ExamKind.EXAM` için sayar. Çalışma seti (PRACTICE) sorusu metin, en az iki şık ve en az bir doğru şıkla tamamdır. Bu kural, kuralın uygulandığı her yerde geçerlidir:

- yayın şartı: `practiceProblems`; sınav için `publishProblems` aynen `EXAM` kuralını kullanır
- hocanın taslağında her sorunun `complete` ve `lacks` alanları: `OnlineExamService.questionOf`, taslağın türüyle
- talebeye verilen sorular (`PracticeService.start`), talebe listesindeki soru sayıları ve havuz: `isCompleteCounted` (`apps/tedrisat/src/practice/domain/practice.ts`)
- sonuçlar: sonuç, denemenin içine çekilmiş sorulardan hesaplanır, bu yüzden ayrıca değişiklik gerekmedi

Sınav davranışı değişmedi. Konusu olmayan sınav sorusu `lacks: ["topic"]` ile eksik kalır ve sınav `EXAM_NOT_READY` hatasıyla yayınlanmaz.

## 2. Kilitli set hocaya görünür

`OnlineExamDraftResponse` (`GET /online-exams/:examId`, ayrıca yayın, yayından kaldırma vb. yazma uçlarının yanıtı) ve `OnlineExamSummaryResponse` (`GET /courses/:id/online-exams`) yeni bir zorunlu alan taşır: **`locked: boolean`**. Değeri `true` ise `POST …/unpublish` çağrısı 409 `EXAM_LOCKED` döner:

- çalışma seti: yayında ve bir talebe seti başlatmış (deneme bitmiş olsun olmasın) ya da bir havuz denemesi setin bir sorusunu çekmiş
- sınav: yayında ve celsesi başlamış
- taslak: her zaman `false`

Alan, yazma korumasıyla aynı sorguyu kullanır (`OnlineExamRepository.startedPracticeIds`). Bu sayede düğme ile API birbirinden ayrışamaz. `GET /courses/:id/practice-set-stats` değişmedi; yalnız bitmiş denemeleri sayar. Nazar'ın "Yayından kaldır" düğmesi `practiceStats.attemptCount` yerine `draft.locked` değerini okumalıdır; bu iş nazar PR'ına kaldı.

## 3. Arapça metin standardı

### Karar

| token | değer | ne |
| -- | -- | -- |
| `--arabic-scale` | `1.4` | Arapça metin, karşılık geldiği Latin boyutun bu katıdır |
| `--fs-arabic-text-min` | `18px` | Böyle bir blok bundan küçük olamaz (1.4 × 13px'lik caption) |
| `--lh-arabic-text` | `2` | Hareke satır aralığı (mevcut token, kullanılarak bağlandı) |
| `--font-arabic` | `"Noto Naskh Arabic", "Geeza Pro", "Traditional Arabic", serif` | Mevcut token |

CSS sınıfı `.mds-arabic-block` ya da öznitelik `[data-arabic-block]`. Arapça bölge kuralı (`:lang(ar)`, tüm `--fs-*` adımlarını büyütür) artık `[data-arabic-block]` taşıyan elemanı kapsamaz. Kapsasaydı, `lang="ar"` olan elemanda `var(--fs-body)` 18px'e çözülür ve Arapça 1.4 yerine 1.575 kat büyürdü. CodeRabbit bunu PR #466'da buldu. Tümüyle Arapça bir sayfada ya da bölgede (`html:lang(ar)`) arayüz zaten Arapça olduğundan `--arabic-scale` 1'e düşer: Arapça ikinci kez büyütülmez. Boyut formülü:
`max(--fs-arabic-text-min × A, Latin boyut × --arabic-scale × A)`. Buradaki `A`, A−/A+ çarpanıdır. Tedris A−/A+ ölçeğini CSS `zoom` ile kapsayıcıya uyguladığından, çarpan hem Arapçayı hem Türkçeyi aynı oranda büyütür. Arapça, her adımda Türkçenin 1.4 katı kalır.

### Neden 1.4

Ölçüm fontTools 4.60.2 ile yapıldı. Kaynak, 2026-11-27'de `github.com/google/fonts` `main` dalından indirilen `ofl/notonaskharabic/NotoNaskhArabic[wght].ttf` ve `ofl/instrumentsans/InstrumentSans[wdth,wght].ttf` dosyalarıdır (varsayılan örnek, `unitsPerEm` 1000). Her harfin değeri, glifin `BoundsPen` ile bulunan `yMax` değerinin `unitsPerEm`'e bölümüdür. Komut çıktısı şuydu:

```
InstrumentSans: sxHeight 510, x 0.51, o 0.52, e 0.52, sCapHeight 720
NotoNaskhArabic: sxHeight 0, ص 0.357, م 0.349, و 0.34, ر 0.341, س 0.34, ى 0.34, ه 0.433, ط 0.671, ا 0.671, ل 0.671, ك 0.671
```

Bu çıktıdan:

- Instrument Sans `OS/2.sxHeight` = 0.510 em; `x`, `o`, `e` harflerinin tepesi 0.51–0.52 em
- Literata x-yüksekliği 0.506 em. Bu değer sistemde zaten yazılıydı (`--fs-arabic` notu: 18px'te 9.1px).
- Noto Naskh Arabic'in gövdesi (ص 0.357, م 0.349, و 0.340, ر 0.341, س 0.340, ى 0.340) ortalama **0.345 em**, elif ve lam 0.671 em. Fontun `sxHeight` değeri 0'dır.

Arapça gövdenin Latin x-yüksekliğine eşitlenmesi için gereken oran 0.51 / 0.345 = **1.48**'dir. Bu, CSS `font-size-adjust: ex-height` ile yapılan normalleştirmenin aynısıdır. Ancak Naskh'ın `sxHeight` değeri 0 olduğundan bu özellik bu fontta güvenilir çalışmaz, oran bu yüzden elle verildi. 1.48 değerinde elif 0.99 em'e çıkar ve bir Türkçe satırın üstündeki satıra taşar. **1.4** değerinde gövde 0.48 em olur, Latin x-yüksekliğinin %95'i. Elif 0.94 em'de kalır. Sistemin matn oranı da (`--fs-arabic` 26px / `--fs-reading` 18px = 1.44) aynı aralıktadır.

Satır aralığında W3C *Arabic & Persian Layout Requirements* (alreq, https://www.w3.org/TR/alreq/) harekelerin ve noktaların Latin'den daha yüksek satır aralığı istediğini belirtir. Sistemin kendi ölçümü (`tokens/typography.css`: en kötü Naskh kelimesi أَمَّا, taban çizgisinin 1.07 em üstüne ve 0.46 em altına uzanır) kırpılmadan güvenli asgariyi 1.70 olarak verir. Tam harekeli blok için `--lh-arabic-text: 2` kullanılır. Soru ve şık metinleri harekeli olabileceğinden bu değer seçildi.

### Kodda nerede

- Tokenlar: `design-system/medaris-unified/tokens/typography.css`, `tools/design-system/sync-libs.mjs` ile `libs/tokens/medaris.css`'e kopyalanır. `regen.mjs` `_ds_manifest.json` ve `_adherence.oxlintrc.json`'u yeniden üretti. `rules.md` MDS-TYPE-04 maddesine `.mds-arabic-block` eklendi.
- Ortak modül: `libs/tokens/arabic.js` (+ `arabic.d.ts`), `@medaris/tokens/arabic`. Derleme gerektirmeyen JS'tir, `medaris-fonts.js` ile aynı desen.
  - `arabicTextProps(text, size?, scale = 1)` → `{ lang?: "ar", dir, "data-arabic-block"?, style? }`, bir elemana spread edilir
  - `arabicFontSize(size = "1em", scale = 1)`
  - `startsArabic(text)` (ilk harf Arapça mı), `hasArabic(text)` (metnin herhangi bir yerinde Arapça var mı)
  - `arabicRuns(text)`: karışık TR+AR metni sıralı parçalara böler; harekeler `Script_Extensions=Arabic` ile parçaya dahil edilir
  - `ARABIC_SCALE`, `ARABIC_TEXT_MIN_PX`, `ARABIC_LINE_HEIGHT`: token değerleri. `libs/tokens/test/arabic.spec.ts` bu değerlerin `medaris.css`'teki değerlerle aynı olduğunu doğrular.
- `apps/tedris/features/online-exams/arabic.ts` ve `apps/nazar/features/online-exams/arabic.ts` artık yalnız bu modülü dışa aktarır (`textProps` = `arabicTextProps`). Mevcut çağrılar (`textProps(q.text, "var(--fs-body)", 1)` ve nazar'daki `textProps(o.text)`) değişmeden yeni standarda geçti.

## Doğrulananlar

- `tedrisat` birim testleri: `lacksOf` için türe göre konu kuralı, `isCompleteCounted`, konusuz PRACTICE sorusuyla `practiceProblems` ve `isLocked`
- e2e testleri (`practice-sets`, `practice-pool`):
  - konusuz PRACTICE sorusu `complete: true` olur, yayınlanır, talebe listesinde 1 soru olarak görünür, başlatılır ve %100 ile biter
  - konusuz EXAM sorusu `lacks: ["topic"]` döner
  - başlatılmış ama bitmemiş sette `practice-set-stats` boştur, ama taslak ve listede `locked: true` döner
  - havuz denemesinin çektiği sette `locked: true` döner
- `libs/tokens`: tespit, karışık metin, ölçek hesabı ve token eşitliği

## Doğrulanamayanlar

- Yeni boyut tarayıcıda görsel olarak denetlenmedi: `check.mjs` yalnız `--static` modunda koşuldu, Chromium ile çalışan tam koşu yapılmadı.
- `practice-pool.e2e.spec.ts` bu değişiklikten önce de rastgele bir testte 401 veya 404 ile ara sıra düşüyor (main'de de görüldü). Bu PR'ın konusu değil.

## Takip

- nazar: "Yayından kaldır" düğmesi `draft.locked` değerini okumalı, set tablosu da `locked` değerini göstermeli. Editördeki "konu eksik" ipucu çalışma setinde gösterilmemeli (API artık `lacks` içine koymuyor).
- nazar ve tedris: soru, şık ve sonuç bileşenlerinde karışık metin için `arabicRuns` kullanılmalı.
- `libs/ui/src/styles/mds/*.css` ile `design-system/medaris-unified/` arasında bu PR'dan önce de bir sapma vardı (`.mds-logo`, `.mds-badge--error`, `medrese.css`). `sync-libs.mjs` bu dosyaları geri yazacağı için bu PR'da yeniden üretilmediler.

Paragraf yönü kuralı 2026-11-27 itibarıyla ilk harfe değil Latin harf olup olmadığına bakar: bkz. [mdrs-248-karisik-yon.md](mdrs-248-karisik-yon.md).
