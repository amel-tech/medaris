# 09 — Medrese dışı ders talebi

Kaynak: `local_docs/ekranlar/nazir/09-medrese-disi-ders-talebi/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/dersler/talep/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Medrese dışı ders talebi'; 'Köşk' seçimi (Beyazıt/Fatih/Nûruosmaniye Köşkü).
- Açıklama 'Bu form medreseye bağlı olmayacak dersler içindir; medrese dersini barındırma hakkı olan köşklerde “Medrese dersi aç” ile kendiniz açarsınız.'
- 'Ders adı*' (yardım 'Önerdiğiniz ad; dersi açan değiştirebilir.'), 'Gerekçe*' (müderris önerisi dahil).
- 'Vazgeç' / 'Talebi gönder'; yan kart 'Talepten sonra' (3 madde: talep köşk nazımına gider, Medaris yönetimi görür; kabulde köşk nazımı açar; ders medreseye bağlı olmaz).

## 3. Durumlar

- Doğrulama: köşk, ders adı, gerekçe zorunlu (hata metni tuvalde yok, doğrulanamadı).
- Gönderim: düğme spinner + disabled; başarıda Toast + 07'ye dönüş; hata Toast `timeout: 0`.
- Yetkisiz: talep gönderme izni tuvalde belirtilmiyor — doğrulanamadı (öneri: herhangi bir medrese nazırı/başmüderris).

## 4. Etkileşimler

- 'Talebi gönder' → talep kaydı oluşur (köşk nazımı + Medaris yönetimi görür).
- 'Vazgeç' → önceki sayfa.

## 5. API

- YOK — yeni endpoint: `POST /madrasahs/:id/offsite-course-requests` {koskId, title, reason}; köşk nazımı/yönetim tarafı için `GET /kosks/:id/course-requests` (ayrı ekranlar, kapsam dışı). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').
- Köşk listesi için mevcut: `GET kosks` — `apps/tedrisat/src/kosk/kosk.controller.ts:49-64`.

## 6. Sınıf

**B** — Köşk nazımına giden talep kaydı ve görüntüleme yeni; e-posta/bildirim gönderimi gerekmiyor (talep Medaris yönetimine ve köşk nazımına yönetim ekranında düşer) → B. Köşk nazımı tarafı bu tuvalde yok.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Talep köşk, ad ve gerekçe ile kaydedilir; gönderen medrese bilgisi saklanır.
2. Alanlardan biri boşsa gönderilmez.
3. Gönderim sonrası talep listede/gönderen için durumu görünür (liste ekranı tuvalde yok — doğrulanamadı).
4. Talep ders oluşturmaz; ders medresenin listesine eklenmez.

## 9. Test senaryoları

- Unit: form doğrulama.
- Playwright: formu doldur → gönder → başarı Toast; API'den talep kaydı 201 ve GET ile okunur.
