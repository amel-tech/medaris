# MDRS-248 — Hızlı soru ekleme (nazar soru editörü)

Hocanın soru editörü (sınav ve çalışma seti ortak, `apps/nazar/features/online-exams/components/exam-editor.tsx`) art arda soru yazmak için yeniden düzenlendi. Backend değişmedi; #466'nın `locked` alanı ve PRACTICE'te konunun zorunlu olmaması burada kullanılır.

## Ne değişti

1. **Seri ekleme.** Yeni bir soru kaydedilince sıradaki boş form listenin sonunda kendiliğinden açılır, imleç "Soru" alanındadır. Var olan bir soruyu düzenleyip kaydetmek formu kapatır, yeni form açmaz. Hiçbir şey yazılmamış boş form soru sayısına, yayın şartlarına ve "Açık soruyu kaydedin" uyarısına girmez. Böyle bir form açıkken "Soru ekle" ikinci bir form açmaz, imleci o forma götürür. Sayfa yeniden okunduğunda boş form yerinde kalır. Başka bir soru açılınca ("Düzenle", "Yeniden dene") boş form kaldırılır, listede boş bir "Eksik" satır kalmaz. Hiçbir şey yazılmamış form kaydedilmez ("Kaydet" kapalı, Cmd+Enter bir şey yapmaz), basılı tutulan Cmd+Enter yalnız bir kez kaydeder.
2. **Klavye.** Cmd+Enter (Windows'ta Ctrl+Enter) formun her alanından kaydeder. Formun altındaki satır kısayolları söyler.
3. **Tab sırası.** Soru → A → B → … sırasında her şık tek duraktır. "Doğru" kutusu şıkkın yanında durur, ama `tabIndex=-1` ile Tab sırasının dışındadır. Kutu, yazılan şıkta **Alt+D** ile işaretlenir; Mac'te Option+D `∂` yazdığı için tuş `event.code === "KeyD"` ile okunur. Kısayol şık alanında `aria-keyshortcuts="Alt+D"`, şıkların yardım metninde ve formun altında yazılıdır. Kutu etiketli bir onay kutusu olarak kalır, ekran okuyucu onu bulur, tıklama ve Space onu işaretler. Enter ile sonraki şıkka geçme ve alt alta yazılmış şıkları yapıştırma eskisi gibi çalışır.
4. **Satır görünümü.** Kaydedilen soru tek satırdır: numara · tek satıra kırpılmış metin · şık sayısı · doğru harf(ler) · konu çipleri · Tamam/Eksik · Düzenle/Sil. Eksikler ikinci satırda yazılır. Metne tıklamak ("Düzenle" gibi) satırı yerinde forma çevirir. Telefonda metin numaranın yanında, bilgiler alt satırda durur.
5. **Konu çipleri.** "Konu numaraları" metin alanı kaldırıldı. Konular formda tıklanabilir çiplerdir (`ChoiceChips`, çoklu seçim, tek Tab durağı, oklarla gezilir). "+ Konu" ile formdan konu açılır ve hemen seçilir; oradaki Enter konuyu açar, soruyu göndermez. "+ Konu" alanında yazılı kalmış bir ad, kaydederken (Cmd+Enter dahil) konu olarak açılır ve soruya eklenir. Çalışma setinde konu isteğe bağlıdır: lejant "Konular (isteğe bağlı)" olur, "konusu yok" satırı çıkmaz (`lacksOf(q, kind)`, API'ninkiyle aynı kural). Sınavda konu zorunlu kalır. `topicsByNumbers` / `numbersOf` ve üç katalog anahtarı (`topicNumbers*`) kaldırıldı.
6. **Boş şık.** Kaydederken boş şıklar atılır ve her "Doğru" işareti kendi şıkkıyla gider (`optionsToSave`). Ortada boş şık varsa form kaydetmeden önce harflerin kayacağını söyler. Boş bir şık doğru işaretliyse kaydetme engellenir ve harfi söylenir ("B şıkkı boş ama doğru işaretli…"). Bu kural Cmd+Enter için de geçerlidir.
7. **Kilit.** Yayın panelinde "Yayından kaldır" (set) ve "Taslağa al" (sınav) artık `draft.locked` değerine bakar. Kilitliyken düğme gösterilmez, yerine kısa bir açıklama çıkar. Set tablosunda kilitli setin "Yayında" rozetinin yanında kilit simgesi durur; ekran okuyucu bunu "Yayından kaldırılamaz" olarak okur.
8. **Katlanabilir üst bölüm.** "Ayarlar" ve "Konular" başlığı, `aria-expanded` taşıyan bir düğme içerir (disclosure deseni; `<details>`/`<summary>` başlığı ekran okuyucunun başlık listesinden düşürdüğü için kullanılmadı). Katlı bölümün alanları `hidden` olarak çizili kalır, yazılan kaybolmaz. Doluysa (başlık var, sınavda süre var; en az bir konu var) kapalı başlar ve özet satırı gösterir ("Ayarlar · Ara sınav · 60 dk", "Konular · 13 konu"). Böylece ilk görünen, Sorular bölümüdür.
9. **Arapça.** Satırdaki metin, yayınlanmış sınavın soru ve şıkları `ArabicText` ile çizilir (`components/arabic-text.tsx`). Arapça başlayan metin tek bir Arapça bloktur (`textProps`). Karışık metinde her Arapça parça kendi Arapça run'ıdır (`arabicRuns`). Form alanları zaten `textProps` taşıyordu; yeni konu alanı `dir="auto"` aldı. Arapça satırda kırpma, metnin sonundan yapılır.

## Doğrulandı

- `apps/nazar/test/exam-editor.spec.tsx`: seri ekleme ve odak, düzenlemede yeni formun açılmaması, Cmd+Enter / Ctrl+Enter, Tab durakları ve Alt+D (Option+D dahil), konu çipleri ve "+ Konu", sınav/set konu kuralı, boş şık ve doğru işaretinin kayması, doğru işaretli boş şık engeli, katlanan bölümler, Arapça satır/form/karışık metin.
- `exam-practice.spec.tsx`, `exam-publish.spec.tsx`, `exam-practice-page.spec.tsx`: `locked` iken düğme yok ve açıklama var, tablodaki kilit.
- `online-exams.spec.ts`: `lacksOf(q, kind)`, `optionsToSave`.
- Yerel tarayıcı (Playwright, kopya veritabanı): Tab ile A'dan B'ye geçme, Alt+D, Cmd+Enter sonrası yeni formun açılması, 1440 ve 390 px düzen. Ekran görüntüleri PR'da değil, iş klasöründe duruyor.

## Doğrulanamadı

- Gerçek bir ekran okuyucuyla (VoiceOver/NVDA) Alt+D'nin ve Tab dışındaki kutunun okunuşu denenmedi. Yalnız roller, etiketler ve `aria-keyshortcuts` test edildi.
- Windows'ta AltGr düzenlerinde (Ctrl+Alt) Alt+D bilerek tetiklenmez; o düzende kutu tıklamayla işaretlenir. Gerçek bir Windows klavyesinde denenmedi.

## Sonraya

- Sorular sürükleyerek yeniden sıralanamıyor; API'de sıralama ucu yok.
