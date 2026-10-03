# 17 — Müderrisleri değiştir (medrese dersi, Dialog)

Kaynak: `local_docs/ekranlar/nazir/17-muderrisleri-degistir-medrese-dersi-dialog/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: 07 üzerinde Dialog (apps/nazir/app/medrese/[medreseId]/dersler/_muderris-dialog.tsx, öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Dialog 'Müderrisleri değiştir' (üst etiket 'BİNA VE İZHAR ŞERHİ'); 'Müderris listesini medrese adına siz değiştirirsiniz; köşk nazımı değiştiremez.'
- 'Müderris' e-posta araması ('Kayıtlı hesabın e-posta adresini eksiksiz yazın; her arama denetim kaydına yazılır.'); 'Müderrisler*' ('En az bir müderris gerekir. Tek müderris dersin imamıdır; birden çok müderris varsa imamı siz belirlersiniz.'); satırlar: 'Dersin imamı:' seçimi, ad, e-posta, 'Çıkar'; alt '2 müderris'; 'Vazgeç' / 'Kaydet'.

## 3. Durumlar

- Doğrulama: en az bir müderris; imam tam olarak biri.
- Yetki: 'Müderris ekle ya da çıkar; imamı değiştir' izni.
- Arama bulamazsa mesaj tuvalde yok — doğrulanamadı.

## 4. Etkileşimler

- E-posta ile ekle, 'Çıkar' ile çıkar, imamı değiştir.
- 'Kaydet' → müderris listesi güncellenir, 07 satırı yenilenir, denetim kaydı.
- 'Vazgeç' → kapatır.

## 5. API

- Müderris verisi: `course_muderris` — `apps/tedrisat/src/database/schema/course.schema.ts` (userId, name, orderIndex; imam bayrağı yok). Yazma: yalnız `PUT courses/:id` ile ders bütünü yenilenir — `apps/tedrisat/src/course/course.controller.ts:123-136` ve `PATCH courses/:id` — `apps/tedrisat/src/course/course.controller.ts:106-120`; sahiplik kontrolü köşk sahibi (`apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts`).
- YOK — yeni endpoint: `PUT /madrasahs/:id/courses/:courseId/muderrises` {muderrises:[{userId}], imamUserId}; `GET /users/lookup?email=` (bkz. 05 kullanıcı dizini riski). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — `course_muderris` tablosu var ama müderris listesini medrese adına değiştirme, imam bayrağı ve e-posta arama yeni → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Son müderris çıkarılamaz.
2. Tek müderris otomatik imam; çoklu ise imam seçimi zorunlu.
3. Köşk nazımı bu değişikliği yapamaz (403).
4. Kayıt sonrası 07 satırında müderris sütunu güncel.
5. Arama denetim kaydına yazılır.

## 9. Test senaryoları

- Unit: müderris listesi reducer + imam kuralı.
- Playwright: 07 → satır → Müderrisleri değiştir → ikinci müderrisi çıkar → Kaydet → satırda tek müderris.
