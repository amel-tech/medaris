# 13 — Kabul kuralları (sonraki faz)

Kaynak: `local_docs/ekranlar/nazir/13-kabul-kurallari-sonraki-faz/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/kabul-kurallari/page.tsx (öneri; tuvalde 'sonraki faz'). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık 'Kabul kuralları'; kural kartları (örn. 'Görünürlük' — 'Bina ve İzhar Şerhi dersini tamamlayan talebe, Maksûd şerhi dersini görür.'; 'Onaysız kayıt'), 'Etkin' anahtarı, 'Düzenle', 'Uygulanmıyor' notu.
- 'Yeni kural' formu: Koşul* (Şu dersleri tamamlayanlar / icâzet [seçilemez]), Koşuldaki dersler*, Seçilen derslerden (Hepsi/En az biri), Etki* (Görünürlük/Onaysız kayıt), Uygulandığı dersler*, 'Kuralın özeti', 'Vazgeç' / 'Kuralı ekle'.

## 3. Durumlar

Sonraki faz; durumlar tasarlanmadı — doğrulanamadı.

## 4. Etkileşimler

Sonraki faz; etkileşim kodlanmayacak.

## 5. API

YOK — yeni endpoint (kodlanmıyor): `GET|POST|PATCH /madrasahs/:id/admission-rules`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**C** — Dosya adı ve index.md 'sonraki faz' diyor; koşul 'icâzet alanlar' seçilemiyor (Medaris icâzet kaydı tutmuyor). Faz kapsamı dışı → kodlanmaz.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Faz açıldığında yeniden şartnamelenecek (bu ekran için kabul kriteri yazılmadı).

## 9. Test senaryoları

- Yok (kodlanmıyor).
