# madrasah-staff — rapor (ce47fce8, 25 Ekim 2026)

## Yazılanlar (hepsi `--strict` temiz; `delurio check graphs/madrasah-staff --strict` 0)

| Akış | Durum | Yapılandırma | Güvence |
|---|---|---|---|
| open-course | 9 | 14304 | 6/6 |
| course-request (nazar formu + nizam Ders talepleri) | 21 | 1784 | 5/5 |
| madrasah-nazir (ata, görevden al) | 13 | 3086 | 6/6 |
| nazir-permissions (nazir/06 düzenleyici) | 6 | 338 | 5/5 |
| course-nazir (MDRS-270) | 14 | 6196 | 6/6 |
| plan-sessions | 9 | 136 | 4/4 |
| edit-curriculum | 7 | 289 | 5/5 |
| hide-week (hafta ve celse) | 10 | 132 | 4/4 |
| review-enrollments | 9 | 258 | 4/4 |
| bulk-add-talebe | 5 | 472 | 5/5 |

`domain/domain.yaml` (`medaris.madrasah-staff`): 12 varlık, 39 eylem, 9 değişmez (biri cinsiyet şartı: `holds: false`, `finding: MS-7`).

## Okumamın en zayıf olduğu yerler

- Sunucunun o an bulduğu şeyler (e-postanın kimi bulduğu, nazırın kime ne verdiği) `havoc` ile modellendi; ihlal yollarının `start` satırında görünmüyorlar (MS-2 yolu yalnız `actor` gösterir).
- course-request'in `api` dalı varsayımsal: `POST /kosks/:id/course-requests`'i hiçbir uygulama çağırmıyor; nizam ekranı yalnız böyle dolar.
- Base UI'nin varsayılan ilk odağını (düzenleme diyaloğunda kapat düğmesi) `dialog.tsx:29` yorumundan okudum, kütüphane kaynağından değil.
- edit-curriculum'da yetkiler beş kümeye indirildi; `editOnly` week.hide'sız sayıldı. Gizli derste kimin 404 aldığını `course.service.ts:327` okumasına dayandırdım.
- Onaylanmış koltuğa ikinci "Onayla"nın bildirimsiz 201 döndüğü `course.service.ts:1629` okuması.

## Bulgular

- **MS-1 [yüksek]** F01 sürüyor: nazar talebi `offsite_course_requests`'e yazılır (`madrasah-course.repository.ts:404`), nizam `course_requests` okur (`course-request.repository.ts:119`); talep hep BEKLEMEDE, medresede de listelenmez (`offsite-page.tsx:41`). nizam metinleri "başmüderris gerekçeyi görür" diyor. Yol: nazarForm, basmuderris; SUBMIT, DONE → parked.
- **MS-2 [yüksek]** F03 sürüyor: nazır atamada hesap ve yasak denetimi yok (`madrasah-nazir.repository.ts:195`); atanan nazır medrese derslerinde yasaktan korunur (`ban-tier.ts:80`). Yol: APPOINT, SEARCH, DONE, SUBMIT, DONE.
- **MS-3 [orta, yeni]** Medrese dersi açılırken yasaklı hesap hoca yapılır (`madrasah-course.service.ts:220` yalnız varlığa bakar); ders nazırında `COURSE_NAZIR_BARRED` var (`course-nazir.service.ts:223`), MUDERRIS de yasaktan korunur (`ban-tier.ts:66`). Yol: barredListed; SUBMIT, DONE → opened.
- **MS-4 [yüksek]** F05 sürüyor: kabul yalnız dersin köşkte olduğuna bakar (`course-request.service.ts:141`); nizam cevabı okumaz (`course-create-form.tsx:160`), "Ders açıldı" der. Yol: api, stillPending=false; … SUBMIT, DONE, FAIL.settled → openedFromRequest.
- **MS-5 [orta]** F02 (learning) bu akışta da sürüyor: tek onay yasağı okumaz (`course.service.ts:1621`), toplu ekleme okur (`bulk-enrollment.service.ts:184`); Başvurular sekmesi yasağı göstermez. Yol: applicantBarred; APPROVE, DONE.
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

## Eski bulgular

F01, F03, F05, F15, F35, F42 sürüyor; F36 yarı yarıya (yukarıda); F02 (learning) burada da sürüyor.

## delurio-graph/0'ın anlatamadıkları

Onay kutusu, seçim kutusu, sekme ve basma düğmesi bileşeni yok (TextField/ListItem ile rol verildi); `when` değerlendirilmiyor ve satır başına koşul (rowMine) satıra bağlanamıyor; çağrılan akışın sonucu ve bağlamı denetlenmiyor; `havoc` değerleri ihlal yolunda görünmüyor; bir ekranın hangi uygulamada olduğu yazılamıyor; canlılık ("talep sonunda ulaşır") yok; sayfa değiştikten sonra görünen toast'ın yeri yok; zamanlayıcı sahte olay. Şart ile kodun yaptığını ayıran alan yoktu; SPEC'e `holds: false` ve `finding` eklendi (25 Ekim 2026).

## Kapsam

Kapsandı: madrasah-course (aç, talep), course-request, madrasah-nazir, madrasah-permission (düzenleyici), course-nazir, lesson (batch, hafta/celse gizle), course (replace, onay, ret, toplu, my-permissions); nazar dersler/yeni, dersler/talep, medrese/nazirlar, ders/nazirlar, celseler/planla, mufredat, mufredat/gizle, talebeler (Başvurular); nizam ders-talepleri ve courses/new?talep. Yalnız domain: hoca değiştirme ve ders gizleme (nazir/17, 18), izin grupları (nazir/16). Dışarıda (zaman): diğer Talebeler sekmeleri, Celseler tablosu, ders ve medrese ayarları, Pano.
