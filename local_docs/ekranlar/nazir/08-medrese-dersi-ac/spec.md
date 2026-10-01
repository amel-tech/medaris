# 08 — Medrese dersi aç

Kaynak: `local_docs/ekranlar/nazir/08-medrese-dersi-ac/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/dersler/yeni/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Medrese dersi aç'; 'Köşk' seçimi (yalnız barındırma hakkı olan köşkler: 'Nûruosmaniye Köşkü · Arapça dil ilimleri · medresenin burada 1 dersi var'; not 'Yalnız medresenizin barındırma hakkı olan köşkler listelenir.').
- 'Ders adı*' (yardım 'Talebeler bu adı görür; müderrisler sonradan değiştirebilir.').
- 'Müderris' e-posta arama (tam eşleşme; 'her arama denetim kaydına yazılır.') ve 'Seçilen müderrisler*' listesi (monogram, 'Dersin imamı:' + ad, e-posta, imam rozeti, çıkar; çoklu seçimde imamı seçme).
- 'Ders ayarları': 'Kapalı ders' ve 'Kayıt onayı gereksin' anahtarları (medrese politikası kilitlerse kilitli + açıklama 'Medresenin “Kayıt her zaman onaylı” politikası bu ayarı kilitler…').
- Not: 'Ders taslak olarak açılır…'; 'Vazgeç' / 'Dersi aç'.

## 3. Durumlar

- Doğrulama: ders adı zorunlu; en az bir müderris zorunlu ('En az bir müderris seçin.'); tek müderris otomatik imam; çoklu ise imam seçimi zorunlu. Alan hata metinleri yalnız bu iki yardım cümlesiyle verilmiş, ayrı hata metni tuvalde yok — doğrulanamadı.
- Politika kilidi: 'Kayıt her zaman onaylı' açıksa 'Kayıt onayı gereksin' açık+disabled.
- Yükleniyor/hata/yetkisiz: ortak (07'deki gibi); 'Medrese dersi aç' izni yoksa sayfa 403.
- Arama sonuçsuz: mesajı tuvalde yok, doğrulanamadı.

## 4. Etkileşimler

- Köşk seçilir; ders adı yazılır; e-postayla müderris eklenir (arama denetime yazılır); 'Çıkar' ile kaldırılır.
- 'Dersi aç' → ders TASLAK olarak oluşur, 07'ye dönülür, Toast.
- 'Vazgeç' → 07.

## 5. API

- Ders oluşturma: `POST kosks/:koskId/courses` — `apps/tedrisat/src/course/course.controller.ts:64-76` (`CreateCourseDto`: `apps/tedrisat/src/course/dto/create-course.dto.ts`; `requiresApproval` kolonu var — `apps/tedrisat/src/database/schema/course.schema.ts`). Medrese bağı, kapalı ders bayrağı, imam alanı yok.
- Mevcut yetki: köşk sahibi ister (`apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts`); medrese nazırı akışı YOK.
- YOK — yeni endpoint: `POST /madrasahs/:id/courses` {koskId, title, muderrisUserIds[], imamUserId, closedCourse, requiresApproval}; `GET /madrasahs/:id/hosting-kosks`; `GET /users/lookup?email=` (bkz. 05 kullanıcı dizini riski). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Ders oluşturma `POST kosks/:koskId/courses` ile kısmen mevcut; medrese bağı, hak kontrolü, müderris/imam, kapalı ders bayrağı ve e-posta ile müderris arama yeni → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Yalnız hak sahibi köşkler seçilebilir.
2. Ad boş veya müderris yoksa gönderilemez.
3. Tek müderris imam olur; çoklu müderriste imam seçilmeden gönderilemez.
4. Oluşan ders TASLAK durumundadır ve 07'de görünür.
5. Politika kilitliyse ilgili anahtar sunucuda zorlanır.
6. İzin olmadan POST 403.

## 9. Test senaryoları

- Unit: müderris/imam seçim reducer'ı; form doğrulama.
- Playwright: Dersler → Medrese dersi aç → köşk, ad, müderris e-postası → Dersi aç → 07'de 'Taslak' satırı.
- Playwright: 'Kayıt her zaman onaylı' politikasıyla anahtar kilitli.
