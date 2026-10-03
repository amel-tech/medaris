# 41 — yasakla-dialog

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Köşk nazımı/müderrisin, bir dersin kayıtlı talebesini ders ya da köşk kapsamında yasakladığı modal pencere (Dialog + Form). Tetik: Dersler / Emsile ve Bina / Talebeler sekmesindeki satırın "Yasakla" düğmesi.
Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/students` üzerinde modal (ayrı rota gerekmez). Mevcut rota yok (apps/nizam/app/[locale]/ altında yalnız `kosks/[id]` ve `decks` var).
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Üst: eyebrow "EMSİLE VE BİNA" (ders adı), başlık "Talebeyi yasakla", kapat (X) düğmesi.
- Talebe kartı: avatar baş harfleri (AK), ad (Abdullah Enes Kocabıyık), e-posta (mono).
- İki açıklama paragrafı: "Yasak hemen geçerli olur…" ve "Kullandığı cihazlardan açılacak yeni hesaplar da aynı kapsamda durdurulur…" (metin ekran.txt'den birebir).
- "* zorunlu alan" notu.
- RadioGroup "Yasağın kapsamı": "Yalnızca bu ders" (varsayılan seçili; alt metin: ders adı + celse/kayıt/içerik) ve "Köşkten de yasakla" (alt metin: köşkün bütün dersleri, başvuru yapamaz).
- Textarea "Yasaklama gerekçesi*" + yardım "Gerekçeyi yasağı görenler ve kaldıracak kişi okur; talebe görmez."
- Koşullu uyarı kutusu "Sıradaki celsenin toplantı bağlantısını yenileyin": "Talebe 7 Ekim Çarşamba 21:00 telafi celsesinin toplantı bağlantısını biliyor olabilir." (yalnız talebenin ders celseleri varsa).
- Alt: "Vazgeç" (ghost), "Yasakla" (yıkıcı ton).

## 3. Durumlar

- Yükleniyor: Yasakla düğmesinde spinner, form kilitli.
- Hata: sunucu hatasında Toast (uyarı/hata `timeout: 0`) ve pencere açık kalır.
- Yetkisiz: kullanıcı bu dersin müderrisi/köşk nazımı değilse "Yasakla" düğmesi hiç çizilmez; sunucu 403 dönerse Toast.
- Form doğrulama: gerekçe boşken "Bir gerekçe yazın." (_kurallar.md madde 14) ve "Yasakla" disabled. Maks. uzunluk: doğrulanamadı (tuvalde yok).
- Boş durum yok (pencere tek talebeyle açılır).

## 4. Etkileşimler

- "Yasakla": kapsam + gerekçe ile yasak oluşturur; başarıda pencere kapanır, satır "Yasaklı" rozetine ve "Yasağı kaldır" düğmesine döner, Toast "Yasak kaydedildi" (metin doğrulanamadı).
- "Vazgeç" / X / Esc: kapatır; perdeye tıklayınca kapanmaz (_kurallar.md madde 20, `disablePointerDismissal`).
- Odak: açılışta gerekçe alanı (formlu pencere, madde 13).
- Kapsam "Köşkten de yasakla" seçilirse köşkün tüm dersleri için tek kayıt açılır.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Yasak oluşturma | YOK — yeni endpoint | `POST /courses/:courseId/bans` body `{ userId: uuid, scope: 'COURSE'/'KOSK', reason: string }` → 201 `BanResponse`. Gerekçe: Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Talebe satırı (liste) | YOK — yeni endpoint | `GET /courses/:courseId/enrollments?status=ENROLLED` → talebe, e-posta, kayıt tarihi, yasak durumu. Mevcut: yalnız köşk bazlı PENDING listesi `apps/tedrisat/src/course/course.controller.ts:175` (`GET kosks/:koskId/enrollments/pending`); onaylı talebe listesi yok. |
| Yetki kontrolü | kısmen | Sahiplik denetimi `assertCourseOwner` ve `koskService.assertOwner` ile yapılıyor (apps/tedrisat/src/course/course.service.ts:127,153); müderris/köşk nazımı rol ayrımı yok — `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` kapsamı doğrulanamadı. |
| Cihaz kısıtlaması | YOK | "Kullandığı cihazlardan açılacak yeni hesaplar durdurulur" için cihaz izi altyapısı backend'de bulunamadı; ilk sürümde kapsam dışı bırakılması önerilir (doğrulanamadı). |

## 6. Sınıf

**B** — Yasak varlığı (tablo: course_id/kosk_id, user_id, scope, reason, banned_by, created_at, lifted_*), servis ve endpoint backend'de yok; üçüncü parti gerekmiyor. Cihaz tabanlı hesap durdurma kısmı ayrıca tasarım ister ve bu spec'in dışındadır.

## 7. Mevcut durum

Yok. `apps/nizam/features/kosks/` altında yalnız köşk/ders formu ve bekleyen kayıt listesi (`components/pending-requests.tsx`, `actions/courses.ts:40-62`) var; Talebeler sekmesi ve Dialog yok. libs/ui'da `dialog.tsx`, `alert-dialog.tsx`, `textarea.tsx` shadcn tabanlı mevcut; `.mds-*` sınıf katmanı henüz yok (_kurallar.md C tablosu).

## 8. Kabul kriterleri

1. Talebe satırında "Yasakla" tıklanınca pencere "Talebeyi yasakla" başlığı ve doğru talebe adı/e-postasıyla açılır.
2. "Yalnızca bu ders" varsayılan seçilidir.
3. Gerekçe boşken (veya yalnız boşluk) "Yasakla" disabled; alana odaklanıp boş bırakınca "Bir gerekçe yazın." görünür.
4. Başarılı yasaklamadan sonra talebenin ders listesindeki durumu "Yasaklı" ve yasak kapsamı etiketi görünür; "Dersten çıkar" kalkar, "Yasağı kaldır" gelir.
5. Yasaklı talebe aynı derse `POST /courses/:id/enroll` yapınca reddedilir (4xx).
6. Perdeye tıklamak pencereyi kapatmaz; Esc ve Vazgeç kapatır.
7. Yetkisiz kullanıcı için sunucu 403 döner ve UI Toast gösterir.
8. Talebe tarafında gerekçe hiçbir yanıtta dönmez (yetkisiz GET'te alan yok).

## 9. Test senaryoları

- Unit (Vitest): form şeması — gerekçe zorunlu; kapsam enum; Dialog bileşeni gerekçe boşken submit'i engeller.
- Unit (backend, `apps/tedrisat/test/*.spec.ts`): ban servisi sahiplik, tekrarlı ban idempotency, ENROLLED→banned geçişi.
- E2E API (Testcontainers, `test/e2e/ban.e2e.spec.ts`): oluştur → kayıt reddi → talebe yanıtında gerekçe yok.
- Playwright (gerçek API): köşk nazımı olarak giriş → ders → Talebeler → Yasakla → kapsam seç → gerekçe yaz → onayla → satırda Yasaklı rozetini doğrula; ikinci talebe hesabıyla derse başvuru denemesi reddedilir.
