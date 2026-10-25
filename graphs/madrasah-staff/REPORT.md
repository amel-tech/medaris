# madrasah-staff — rapor (ce47fce8, 25 Ekim 2026)

**Sonradan işlenenler (main 4b1f9f78):** #369 (F02), #371 (F03), #372 (F01) ve #373 (F05). Değişen öğelerin `source:` satırları 4b1f9f78'i gösteriyor, gerisi ce47fce8'i. Her yeni güvence, düzeltmeden önceki davranışı yazan bir kopyada kırılıyor, yenisinde tutuyor.

## Yazılanlar (hepsi `--strict` temiz; `delurio check graphs/madrasah-staff --strict` 0)

| Akış | Durum | Yapılandırma | Güvence |
|---|---|---|---|
| open-course | 9 | 14304 | 6/6 |
| course-request (nazar formu + nizam Ders talepleri) | 24 | 2696 | 8/8 |
| madrasah-nazir (ata, görevden al) | 13 | 3838 | 8/8 |
| nazir-permissions (nazir/06 düzenleyici) | 6 | 338 | 5/5 |
| course-nazir (MDRS-270) | 14 | 6196 | 6/6 |
| plan-sessions | 9 | 136 | 4/4 |
| edit-curriculum | 7 | 289 | 5/5 |
| hide-week (hafta ve celse) | 10 | 132 | 4/4 |
| review-enrollments | 9 | 258 | 5/5 |
| bulk-add-talebe | 5 | 472 | 5/5 |

`domain/domain.yaml` (`medaris.madrasah-staff`): 12 varlık, 39 eylem, 13 değişmez (biri cinsiyet şartı: `holds: false`, `finding: MS-7`).

## Okumamın en zayıf olduğu yerler

- Sunucunun o an bulduğu şeyler (e-postanın kimi bulduğu, nazırın kime ne verdiği) `havoc` ile modellendi; ihlal yollarının `start` satırında görünmüyorlar (MS-2 yolu yalnız `actor` gösterir).
- course-request'in iki doğrudan çağrı dalı varsayımsal: `POST /kosks/:id/course-requests`'i hiçbir uygulama çağırmıyor, kabulü yeni açılmamış bir dersle de hiçbir uygulama göndermiyor. "Bir ders tek talebi karşılar" güvencesi ancak ikincisinde sınanabiliyor.
- Base UI'nin varsayılan ilk odağını (düzenleme diyaloğunda kapat düğmesi) `dialog.tsx:29` yorumundan okudum, kütüphane kaynağından değil.
- edit-curriculum'da yetkiler beş kümeye indirildi; `editOnly` week.hide'sız sayıldı. Gizli derste kimin 404 aldığını `course.service.ts:327` okumasına dayandırdım.
- Onaylanmış koltuğa ikinci "Onayla"nın bildirimsiz 201 döndüğü `course.service.ts:1629` okuması.

## Bulgular

- **MS-1 [yüksek, kısmen düzeldi: #372; kalan kısım orta]** F01: nazar talebi `offsite_course_requests`'e yazılıyordu (`madrasah-course.repository.ts:404`), nizam `course_requests` okuyor (`course-request.repository.ts:119`); talep hep BEKLEMEDE kalıyordu. Yol: nazarForm, basmuderris; SUBMIT, DONE → parked.
  - #372'den beri talep `course_requests`'e yazılıyor ve köşkün Ders talepleri'ne düşüyor (4b1f9f78'de `madrasah-course.repository.ts:410`). Güvence `nazar-request-reaches-kosk`. Eski tablo okunmuyor, yazılmıyor; sonraki bir göç onu silecek.
  - Kalan: nazar medresenin taleplerini listelemiyor (`offsite-page.tsx:41`), ama nizam metinleri hâlâ "başmüderris gerekçeyi görür" diyor (`CourseRequestsPage.answerNote`, `rejectedBody`). Ret gerekçesi medreseye ulaşmıyor.
- **MS-2 [yüksek, düzeldi: #371]** F03: nazır atamada hesap ve yasak denetimi yoktu (`madrasah-nazir.repository.ts:195`); atanan nazır medrese derslerinde yasaktan korunur (`ban-tier.ts:80`). Yol: APPOINT, SEARCH, DONE, SUBMIT, DONE.
  - #371'den beri hesabı olmayan kimlik 404 `MADRASAH_NAZIR_UNKNOWN_ACCOUNT`, medrese ya da derslerinden birinde yasaklı kişi 409 `MADRASAH_NAZIR_BARRED` alıyor (4b1f9f78'de `madrasah-nazir.service.ts:113-116`). Güvenceler `only-accounts-appointed` ve `barred-never-appointed`. Köşk yasağı sayılmıyor: MS-17.
- **MS-3 [orta, yeni]** Medrese dersi açılırken yasaklı hesap hoca yapılır (`madrasah-course.service.ts:220` yalnız varlığa bakar); ders nazırında `COURSE_NAZIR_BARRED` var (`course-nazir.service.ts:223`), MUDERRIS de yasaktan korunur (`ban-tier.ts:66`). Yol: barredListed; SUBMIT, DONE → opened.
- **MS-4 [yüksek, düzeldi: #373]** F05: kabul yalnız dersin köşkte olduğuna bakıyordu (`course-request.service.ts:141`); nizam cevabı okumuyor, yalnız "Ders açıldı" diyordu (`course-create-form.tsx:160`). Yol: api, stillPending=false; … SUBMIT, DONE, FAIL.settled → openedFromRequest.
  - #373'ten beri başka bir talebi karşılayan ders 409 `COURSE_REQUEST_COURSE_TAKEN` alıyor (güvence `course-answers-one-request`). Kabul edilmeyen talep için nizam kalıcı bir "Talep yanıtlanamadı" uyarısı gösteriyor (güvence `not-accepted-is-said`).
  - "Ders açıldı" yine söyleniyor, çünkü ders gerçekten açıldı; uyarı onun yanında duruyor. Ders kendiliğinden geri alınmıyor.
  - Ders denetimi kilitsiz ve `course_requests.course_id` üzerinde eşsiz indeks yok (`course-request.schema.ts:49`). Aynı anda gelen iki kabul aynı dersle ikisi de geçebilir. Güvence yalnız art arda gelen çağrıları kapsıyor (okumayla; denenmedi).
- **MS-5 [orta, düzeldi: #369]** F02 (learning): tek onay yasağı okumuyordu (`course.service.ts:1621`), toplu ekleme okur (`bulk-enrollment.service.ts:184`). Yol: applicantBarred; APPROVE, DONE. #369'dan beri yasaklı başvuran 403 `BAN_ACTIVE` alıyor ve başvuru bekliyor; güvence `barred-never-approved`. Başvurular sekmesi yasağı hâlâ göstermiyor; ret metni MS-18.
- **MS-6 [orta]** F15 sürüyor: `createCourseRequest` izin değil rol denetler (`course-request.service.ts:99`), denetim kaydı yok. Yol: api, nazirGiven → directRefused.
- **MS-7 [orta]** Cinsiyet şartı karşılanmıyor: yüz yüze ders (`course.schema.ts:93`) her talebeyi alır; onay, toplu ekleme ve hoca atama cinsiyet okumaz; cinsiyet boş olabilir (`user-profile.schema.ts:33`).
- **MS-8 [düşük]** F35 sürüyor: "Dersi aç"ta SELF_GRANT_REFUSED → "Bir şeyler ters gitti" (`courses.ts:393`).
- **MS-9 [düşük]** F36'nın ikinci yarısı sürüyor (daralmış): `/mufredat/gizle` izin sormaz, dersin her kapsam sahibi "Gizle"yi görür. İlk yarısı artık geçerli değil: sayfa salt okunur olduğunu söylüyor (`curriculum-editor.tsx:334`).
- **MS-10 [düşük, yeni]** Bütün ders kaydı boş haftayı week.hide olmadan gizler (`course.repository.ts:730`); gizleme yolu week.hide ister. Yol: editOnly; DROP_EMPTY_WEEK, SAVE, DONE.
- **MS-11 [düşük, yeni]** `createCourseRequest` gizli köşk ve medreseyi kabul eder (`kosk.repository.ts:472`, `course-request.repository.ts:175`).
- **MS-12 [düşük, yeni]** API'nin izin verip görevden aldırdığı Medaris nazımına nazar düğme çizmez (`scope.ts:145`, `madrasah-authority.ts:36`).
- **MS-13 [düşük, yeni]** Ayar okuma izni olmayan nazıra politikalar "şu an okunamadı" denir (`open-course-page.tsx:78`); kilitler gösterilmez.
- **MS-14 [düşük, yeni]** `madrasah.admission_rules` ve `madrasah.appeal_open` verilebiliyor (`permission-catalog.ts:129`) ama hiçbir rota sormuyor.
- **MS-15 [düşük]** F42'nin dört yorumu da sürüyor; yeni: `pano/actions.ts:10` (başmüderris reddedilir diyor; rolüyle enrollment.decide tutar), `offsite-page.tsx:30`, `offsite-course-request.schema.ts:29`.
- **MS-16 [düşük, emin değilim]** Toplu eklemede cevap gelince odaklı "Ekle" kaybolur, yeni odak verilmez (`bulk-add-dialog.tsx:106`).
- **MS-17 [orta, yeni, okumayla; test yazılmadı]** Medrese nazırı atanırken köşk yasağı sorulmuyor. `isBarredInMadrasah` yalnız medresenin yasağına ve derslerinin ders yasaklarına bakıyor (4b1f9f78'de `ban.repository.ts:728`). Medrese dersini barındıran köşkün yasağı ise o derse girişi engelliyor (`ban.repository.ts:219`). Ders nazırı atamasındaki denetim köşk yasağını da sayıyor (`course-nazir.service.ts:223`). Yol: targetBarred=kosk; APPOINT, SEARCH, DONE, SUBMIT, DONE.
- **MS-18 [düşük, yeni]** nazar Başvurular'da yasaklı başvurana basılan "Onayla" yalnız "Bir şeyler ters gitti. Biraz sonra yeniden deneyin." diyor (`pano.ts:253`, `BAN_ACTIVE` için ayrı metin yok). Başvuru bekliyor ama sebebi söylenmiyor. #369 bunu ayrı iş olarak bıraktı.
- **MS-19 [düşük, yeni]** Talepten açılan derste kabul hangi nedenle başarısız olursa olsun (ağ, 5xx, 403, 404) nizam aynı uyarıyı gösteriyor: "talep artık beklemiyor; başka bir nazım yanıtlamış olabilir" (`course-create-form.tsx:166`). Talep aslında hâlâ bekliyor olabilir. Yol: FAIL.other → openedFromRequest.

## Eski bulgular

F03 (#371), F05 (#373) ve F02 (#369) düzeldi; F01 kısmen düzeldi (#372, yukarıda). F15, F35, F42 sürüyor; F36 yarı yarıya (yukarıda).

## delurio-graph/0'ın anlatamadıkları

Onay kutusu, seçim kutusu, sekme ve basma düğmesi bileşeni yok (TextField/ListItem ile rol verildi); `when` değerlendirilmiyor ve satır başına koşul (rowMine) satıra bağlanamıyor; çağrılan akışın sonucu ve bağlamı denetlenmiyor; `havoc` değerleri ihlal yolunda görünmüyor; bir ekranın hangi uygulamada olduğu yazılamıyor; canlılık ("talep sonunda ulaşır") yok; sayfa değiştikten sonra görünen toast'ın yeri yok; zamanlayıcı sahte olay. Şart ile kodun yaptığını ayıran alan yoktu; SPEC'e `holds: false` ve `finding` eklendi (25 Ekim 2026).

## Kapsam

Kapsandı: madrasah-course (aç, talep), course-request, madrasah-nazir, madrasah-permission (düzenleyici), course-nazir, lesson (batch, hafta/celse gizle), course (replace, onay, ret, toplu, my-permissions); nazar dersler/yeni, dersler/talep, medrese/nazirlar, ders/nazirlar, celseler/planla, mufredat, mufredat/gizle, talebeler (Başvurular); nizam ders-talepleri ve courses/new?talep. Yalnız domain: hoca değiştirme ve ders gizleme (nazir/17, 18), izin grupları (nazir/16). Dışarıda (zaman): diğer Talebeler sekmeleri, Celseler tablosu, ders ve medrese ayarları, Pano.
