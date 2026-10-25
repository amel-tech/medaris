# learning: REPORT (ce47fce8, 25 Eki 2026)

**Sonradan işlenenler (main 4b1f9f78):** #369 (F02) ve #349 (ödevin değerlendirilmesi). Değişen öğelerin `source:` satırları 4b1f9f78'i gösteriyor, gerisi ce47fce8'i.

## Akışlar ve domain
Hepsi `delurio page --strict` ve `delurio check graphs/learning --strict` ile temiz (9 graf, 0 hata, 0 uyarı).

- `enrollment`: ders sayfasındaki kayıt kartı, geri çekme, ayrılma, ekibin kararları. 17 durum, 1304 konfigürasyon, 8/8.
- `session`: celse sayfası ve kilidi, kilitten başvuru. 15 durum, 1540, 6/6.
- `homework`: Ödev/Ödevim ve hocanın değerlendirmesi (#349). 10 durum, 49536, 4/4.
- `questions`: Sorularım sekmesi. 9 durum, 521, 4/4.
- `notes`: Notlarım (yeni akış). 9 durum, 1212, 4/4.
- `calendar-feed`: Takvim aboneliği sayfası. 4 durum, 84, 3/3.
- `calendar-feed-read`: takvim uygulamasının okuması, ekransız. 11 durum, 44064, 6/6.
- `partner-enrollment`: PUT. 15 durum, 40380, 6/6.
- `partner-unenrollment`: DELETE (yeni akış). 8 durum, 2484, 5/5.
- `domain/domain.yaml` (`medaris.learning`): 12 varlık, 42 aksiyon, 12 politika, 11 değişmez.

## Okumamın en zayıf olduğu yerler
- **Pasif kapsam.** effective-permissions.ts:337'yi okudum. Hangi rolün bir kapsamı pasif yaptığını (`isPassiveScope`) izlemedim.
- **Ekip olayları.** Talebenin sayfası olayları ancak yeniden yüklenince görür, bu yüzden hepsi `opening`'e döner. Açık sayfada iptal veya çıkarma senaryoları, sayfanın kendiliğinden yenilenmediği varsayımına dayanıyor.
- **Cinsiyet.** Realm'in cinsiyeti kayıtta zorunlu tutup tutmadığını okumadım (auth-account alanı). Yalnızca tedrisat'ın null kabul ettiğini gördüm (user-identity.ts:38).
- **Ortak uygulama 503.** KEYCLOAK_ADMIN_UNAVAILABLE'ın `findAccount`'tan geldiğini çıkardım, izlemedim.

## Bulgular
1. **LEARNING-1 [yüksek, düzeldi: #369]** Onay ve yeniden kabul yasağı sormuyordu (course.service.ts:1621). Toplu ekleme (bulk-enrollment.service.ts:184) ve ortak uygulama yolu soruyor. Yol: pending, barred=true → TEAM_APPROVE.
   - #369'dan beri onay, geri alınan koltuğun onayı ve tamamlananın yeniden açılması yasaklıyı 403 BAN_ACTIVE ile reddediyor (4b1f9f78'de course.service.ts:1638, :1718).
   - Güvence `team-never-seats-barred` olarak `enrollment`'ta. Üç yolun her birinin korumasını kaldıran kopyada kırılıyor, yenisinde tutuyor. Domain'deki `barred-takes-no-seat-by-any-road` artık `holds: false` değil.
2. **LEARNING-2 [orta]** Kart yalnız `enrollment.status`'tan seçiliyor (course-view.ts:21).
   - Yasaklı talebe "Devam ediyor" ve "Dersten ayrıl" görüyor; ayrılınca 403 alıyor. Yol: enrolled, barred → LEAVE.
   - Kilit, koltuğu olana "Kayıt başvurusu yap" sunuyor (lesson-lock.ts:27). Pasif koltukta başvuru aynı satırı döndürüyor ve sayfa aynı kilide dönüyor. Yol: enrolled, passive → APPLY.
3. **LEARNING-3 [orta]** Düğme ve not yalnız `requiresApproval || isPrivate` okuyor (app/courses/[courseId]/page.tsx:82).
   - Köşkün `alwaysRequireApproval` alanı yanıtta var ama okunmuyor; platform ve medrese politikaları da okunmuyor (course.service.ts:1535).
   - Kilitteki düğme her zaman "Kayıt başvurusu yap".
   - Yol: approvalByPolicy → ENROLL, DONE → receivedDialog.
4. **LEARNING-4 [orta]** API iptal edilmiş celseye ve ödevi olmayan celseye teslim alıyor; `isLiveLesson` yalnız `archivedAt`'a bakıyor (lesson-submission.repository.ts:91). Son tarih ve not yok; PRD M9-1 ve M9-4 son tarih istiyor (docs/PRD.md:270). Yol: DONE, CELSE_CANCELLED, ADD_FILE, DONE.
5. **LEARNING-5 [yüksek]** Hiçbir kayıt yolu cinsiyeti ya da `inPerson`'ı okumuyor; yüz yüze derste kadın ve erkek ayrılmıyor ve cinsiyet null olabiliyor. Yol (deneme kopyası): gender=missing, inPerson → TEAM_ADDS.
6. **LEARNING-6 [düşük]** Hata iletileri yanıltıyor.
   - Kayıtta 409, "Sayfa yenilendi" diyor ama sayfa yenilenmiyor (course-aside.tsx:84, lesson-locked.tsx:92).
   - 403 BAN_ACTIVE, "Biraz sonra yeniden dene" olarak gösteriliyor (action-error.ts:11).
7. **LEARNING-7 [düşük]** en ve ar kataloglarında `enroll`, `enrolling`, `continue` ve `enrolled` Türkçe kalmış (en/tedris.json:14-17).
8. **LEARNING-8 [düşük]** Sorularım metni okuyanları yalnız hoca ve ders nazırı olarak sayıyor; köşk nazımı, başmüderris ve başnazım da okuyor (permissions.ts:352).
9. **LEARNING-9 [düşük]** Gizlenmiş celseye not ve soru yazılabiliyor, çünkü `findLessonCourseId` gizli celseyi de sayıyor (course.repository.ts:1275). Ödev ise aynı durumda 404 veriyor. Yol: DONE, CELSE_HIDDEN, ADD, DONE.
10. **LEARNING-10 [düşük]** Satır içi onaylarda ve düzenleme formlarında odak kayboluyor (session-homework.tsx:588, course-questions.tsx:336, lesson-notes.tsx:597). Gizli celsede 404 "kaldırıldı" diye duyuruluyor, ardından dosya geri geliyor (session-homework.tsx:549).
11. **LEARNING-11 [düşük]** Bayat yorumlar "en çok 5 dosya" diyor; sınır 10 (submission/files/route.ts:13, session-homework.tsx:109).

## Eski bulgular
- **F02:** düzeldi (#369; LEARNING-1).
- **F13:** kısmen sürüyor (LEARNING-4); celse başına ödev artık var.
- **F19:** sürüyor (LEARNING-2).
- **F20:** sürüyor (LEARNING-3).
- **F30:** sürüyor. API kaldırılmış talebeye kendi yazdıklarını okutup sildiriyor (course.service.ts:582); tedris sekmeyi gizliyor (course-page.tsx:158).
- **F31:** sürüyor. Programım yalnız ENROLLED derslerini gösteriyor (schedule.repository.ts:187). Akış COMPLETED dersleri, okutulan ve yönetilen dersleri de katıyor (calendar-feed.repository.ts:53). Alt başlık ise "Kayıtlı olduğun derslerin" diyor.
- **F32:** sürüyor (feed-poll-limiter.ts:43).

## delurio-graph/0'ın anlatamadıkları
- "Başka biri" için `by` yok; ekip ve müderris olayları talebenin durumlarına konuyor.
- Sayaç yok; dosya sayısı none/some/full ve `lastSlot` havoc'uyla yaklaşık modelleniyor.
- Bir akış tek öğe izliyor: tek soru, akıştaki tek ders.
- Satır içi onay ve odak kaybı ifade edilemiyor; `rules` hiçbir araç tarafından okunmuyor.
- İstek sürerken açık kalan diyalog ancak `state` adlı bir `when` ile çizilebiliyor.
- Cinsiyet kuralı ancak kodun okumadığı değişkenler eklenerek sınanabiliyor (deneme kopyasında yapıldı).
- Domain'deki `relations`, `helpers` ve `held: false` alanları standart dışı; hiçbir araç okumuyor.

## Kapsam
**Kapsandı:**
- CourseController: talebe rotaları ve ekibin satıra kararları.
- LessonController: oturum ve .ics.
- lesson-note, lesson-question, lesson-submission: talebe tarafı.
- calendar-feed'in iki denetleyicisi.
- partner-enrollment: PUT ve DELETE.
- Dosya indirmeler ve schedule yalnız domain'de.

**Dışarıda kaldı:**
- İlerleme penceresi.
- Derslerim, Keşfet ve köşk listeleri (nav).
- Programım ekranı.
- İzle sayfası (live-media).
- Deste sekmesi (kosk-decks).
- nazar'daki toplu ekleme ve personel listeleri (diğer alanlar).
