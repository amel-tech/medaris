# MDRS-248 — Soru editörü: canlı önizleme, konu listesi, varsayılan kapalı not

Hocanın set/sınav sayfası (`apps/nazar/features/online-exams/components/exam-editor.tsx`) sahibin 28 Kasım 2026'daki sekiz maddesine göre yeniden düzenlendi. Not izninin varsayılanı için API'de (`apps/tedrisat`) küçük bir değişiklik var.

## Ne değişti

1. **Talebe notu varsayılan kapalı.** Sahibin sözü: "default olarak yorum eklenemez olmalı, ikon tıklanırsa eklenebilir olmalı". `OnlineExamRepository.addQuestion` yeni her soruya `talebe_notes = false` yazar; çalışma setinde de böyledir (#473'te setin yeni sorusu açıktı). Var olan sorulara dokunulmadı, migration yok. Nazar'daki yeni soru formu da kapalı başlar. Alanı göndermeyen eski bir cevap da artık kapalı okunur (`takesNotes`). `ExamQuestionResponse.talebeNotes` açıklaması değişti. Bu yüzden `swagger-docs/tedrisat.json` ve üretilmiş `ExamQuestionResponse.ts` içindeki tek cümle değişti; üretecin getirdiği `info.version` gürültüsü alınmadı (`assert:openapi-fresh` yeşil).
2. **Talebe notları açıklaması kalktı.** "Talebelerin bu setteki sorulara yazıp size gönderdiği notlar…" satırı ve `QuestionNotes.intro` anahtarı (tr/en/ar) silindi.
3. **Sorular en üstte, canlıdaki gibi.** Sayfanın sırası: Sorular, Ayarlar, Konular, Yayınla, Talebe notları. Kaydedilmiş her soru, talebenin çözme ekranındaki hâliyle bir kart olarak görünür. Metin satır sonlarıyla birlikte gösterilir (`whitespace-pre-line`). Yalnız Arapça olan bir soru paragraf olarak sağdan sola okunur (`paragraphDir`), karışık metin `ArabicText` ile çizilir. Şıklar, tedris'in #477 karolarının salt okunur kopyasıdır: harf rozeti, metin, eşit yükseklik (`auto-rows-fr`). Her şık en çok 32 karakterse (`optionsLayout`, tedris'teki kural) 768px'ten geniş ekranda iki sütun olur, yoksa tek sütun. Nazar'ın tek kırılma noktası `md` olduğu için tedris'teki 40rem yerine 768px kullanıldı. Doğru şık yeşil zeminli, ✓ işaretli ve ekran okuyucu için "Doğru" adlıdır; ayırt edici yalnız renk değildir. Kartın köşesinde talebe notu ikonu, kalem ("1. soruyu düzenle") ve çöp kutusu ("1. soruyu sil") durur. Eski satırdaki "Tamam" rozeti, "n şık · Doğru: B" bilgisi ve metne tıklayınca açılma kalktı; `rowText` silindi. Kartlar sıkıdır: `p-3`, şıklar arası `gap-1`, şık yüksekliği `control-small`.
4. **Eksik soru.** "Eksik" rozeti yerine sorunun metninin sonunda bir ünlem (`warning` simgesi) durur. Ünlem odaklanabilen bir düğmedir; üzerine gelince ya da odaklanınca tooltip eksikleri satır satır söyler ("Doğru şık işaretli değil" vb.). Adı "Eksik: <eksikler>" olur (`OnlineExams.lacksLabel`); tıklanınca soruyu açar. Eksik sorunun kartı `bg-error-subtle` ve `border-error-default` ile hafif kırmızıdır. Yeni anahtarlar: `lackText`, `lackOption`, `lackCorrect`, `lackTopic`, `lacksLabel`.
5. **Konu seçimi bir listede.** Formdaki "+ Konu" kaldırıldı; konu Konular bölümünde eklenir. Konu çipleri (`ChoiceChips`) yerine aranabilir, çoklu seçimli bir liste var: `libs/ui/src/mds/combobox.tsx` içinde yeni `MultiCombobox`, Base UI `Combobox` ile `multiple`. Tasarım sisteminde combobox yok. Liste, `Select`'in `.mds-popup`/`.mds-option` katmanını kullanır (canvas kural 22). Seçilenler alanın içinde çip olarak durur, her çipin adı "Çıkar: <konu>" olan bir silme düğmesi var. Klavye: yazmak listeyi süzer, oklar gezinir, Enter seçer ya da seçimi kaldırır, boş alanda Backspace son çipi siler, Escape listeyi kapatır. Alandaki Enter soruyu göndermez. Stil `libs/ui/src/styles/mds/baseui.css` içindedir (`.mds-combobox*`). Yeni anahtarlar: `topicsSearch`, `topicsNoMatch`, `topicUnpick`. Kullanıcının cümlesi yarım kaldığı için "combobox" yorumu orkestratörün kararıdır.
6. **Kısayol metinleri kalktı, kısayollar duruyor.** "Kaydet: ⌘ + Enter…" (`shortcutHint`) ve "Tab ya da Enter ile sonraki şıkka geçin…" (`optionsHelp`) silindi. `aria-keyshortcuts` duruyor. Gerçek bir Chromium'da (Playwright 1.63, kopya veritabanı) ölçülen davranışlar, değişiklikten önce ve sonra aynıdır:
   - Form açılınca imleç "Soru"dadır; Tab "1. şık"a gider.
   - "1. şık"ta Enter "2. şık"a geçer.
   - "2. şık"ta Alt+D (`code: KeyD`) "Doğru"yu işaretler, tekrar basınca kaldırır; şıkkın metni değişmez.
   - Boş bir şıkka üç satır yapıştırınca her satır bir şık olur.
   - Cmd+Enter ve Ctrl+Enter kaydeder ve sıradaki boş form açılır.
   Hiçbiri çalışmaz değildi, kod düzeltmesi gerekmedi.
7. **Konu numarası önerisi.** Konular bölümündeki "Numara" alanı, hiçbir konunun almadığı en küçük numarayla dolu gelir (`nextFreeNumber`, API'ninkiyle aynı kural). Üzerine yazılabilir; boşaltılırsa numarayı API seçer. Her eklemeden sonra öneri yeniden hesaplanır.
8. **Konular açıklaması kalktı.** "Dersin konuları, numaralarıyla…" (`topicsIntro`) silindi.

Kaldırılan nazar anahtarları (tr/en/ar): `OnlineExams.topicsIntro`, `optionsHelp`, `shortcutHint`, `complete`, `incomplete`, `edit`, `optionCount`, `correctLetters`, `addTopicShort`, `newTopicLabel`, `newTopicAdd`, `QuestionNotes.intro`.

Graflar: `nazar.exams.edit` içinde `topicsIntro` düğümü silindi. `rowState`, `rowEdit` ve `rowRemove` yeni adlarına ve satırlarına çekildi, katalog güncellendi. Diğer `source:` satırları kodun yeni satırlarına kaydırıldı.

## Doğrulandı

- `pnpm nx run-many -t typecheck lint module-boundaries --skip-nx-cache`: 56 görev yeşil. `tools/ci/biome-ratchet.mjs` taban çizgisinin altında.
- `pnpm nx run-many -t build --skip-nx-cache`: 16 görev yeşil.
- `pnpm nx run-many -t test --exclude tedrisat --skip-nx-cache`: 15 görevden 14'ü yeşil. Kırmızı olan `keycloak-theme:test` (`email.e2e.spec.ts`, Keycloak 401); aynı test bu makinede `main`'de (05dc62ae) de aynı hatayla düşüyor.
- tedrisat: `vitest run test/unit` 1369 test yeşil; `question-notes`, `practice-sets`, `practice-pool` e2e 28 test yeşil. `practice-sets` ilk koşuda bir kez 401 aldı, tek başına tekrar koşunca 12/12 yeşil.
- `apps/nazar`: tüm suite (95 dosya) yeşil. Yeni testler: önizleme kartı, uzun şıklarda tek sütun, ünlem + tooltip + kırmızı kart, combobox ile seçim ve Enter'ın soruyu göndermemesi, konu numarası önerisi, Sorular'ın en üstte olması, metinlerin yokluğu, varsayılan kapalı not. `libs/ui/test/combobox.spec.tsx`: süzme, çoklu seçim, eşleşme yok satırı, çip silme.
- `delurio check graphs --strict --baseline graphs/delurio.baseline.sarif` (0.14.0): 186 graf, 0 hata, 19 uyarı.
- Yerel tarayıcı (kopya veritabanı, 1280 ve 390 px): önce/sonra ekran görüntüleri; combobox'ta yazma, ok + Enter ile seçme, Backspace, Escape.

## Doğrulanamadı

- Keycloak e2e (`keycloak-audience`, `keycloak-theme` e-posta) bu makinede düşüyor; değişiklikle ilgisi yok.
- Ekran okuyucuyla (VoiceOver/NVDA) combobox ve ünlem tooltip'i denenmedi; yalnız roller ve adlar test edildi.
- Safari ve Firefox'ta kısayollar ölçülmedi; yalnız Chromium kurulu.
- Koyu tema ekran görüntüsü alınmadı.
