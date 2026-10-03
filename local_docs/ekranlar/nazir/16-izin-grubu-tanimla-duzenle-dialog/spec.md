# 16 — İzin grubu tanımla / düzenle (Dialog)

Kaynak: `local_docs/ekranlar/nazir/16-izin-grubu-tanimla-duzenle-dialog/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: 05 üzerinde Dialog (apps/nazir/app/medrese/[medreseId]/nazirlar/_grup-dialog.tsx, öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Dialog 'İzin grubu tanımla'; 'Grup adı*' ('İzin verirken bu adı görürsünüz.'); 'Kapsam' RadioGroup: Medrese / Ders (açıklamalı; 'Kapsam, gruba girebilecek izinleri belirler.').
- 'İzinler*' ('Yalnız verebileceğiniz izinler listelenir. 0 izin seçili.') — 'Medrese' (10) ve 'Medrese dersleri' (20) izin onay kutuları; not 'Grubu henüz kimse kullanmıyor…'.
- Alt: 'Medrese kapsamı · 0 izin seçili', 'Vazgeç' / 'Grubu kaydet'.

## 3. Durumlar

- Doğrulama: ad zorunlu; en az bir izin (etiket 'İzinler*'). Hata metinleri tuvalde yok — doğrulanamadı.
- Kapsam Ders iken yalnız ders izinleri; Medrese iken hepsi (kural: kapsam girebilecek izinleri belirler).
- Düzenlerken grubu kullanan varsa: önce 'Bu grubu {n} kişi kullanıyor' AlertDialog'u + RadioGroup, varsayılan seçenek yok, onay seçime dek disabled (kural 16); seçenek metinleri tuvalde yok — doğrulanamadı.

## 4. Etkileşimler

- Kapsam değişir → izin listesi süzülür.
- 'Grubu kaydet' → grup oluşur/güncellenir; 05 grup kartları güncellenir.
- Silme/düzenlemede kullanıcı varsa kullanıcılara ne olacağı sorulur.

## 5. API

- YOK — yeni endpoint: `POST|PATCH|DELETE /madrasahs/:id/permission-groups[/:groupId]` {name, scope, permissions[], onInUse:'detach'|'keep'}; `GET /madrasahs/:id/permissions`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — İzin grubu CRUD ve kullanılan grup düzenlenince/silinince AlertDialog (kural 16) yeni modeldir; backend yok → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Ad ve en az bir izin olmadan kaydedilmez.
2. Yalnız verenin verebildiği izinler seçilebilir.
3. Kapsam 'Ders' ise medrese izinleri disabled.
4. Kullanılan grup düzenlenince/silinince kullananlar için seçim sorusu gelir ve seçim olmadan onaylanamaz.
5. Kaydedilen grup 05'te 'N izin · M nazıra verildi' ile görünür.

## 9. Test senaryoları

- Unit: izin–kapsam süzgeci, 'N izin' sayacı.
- Playwright: Grup tanımla → ad + 2 izin → kaydet → kartta '2 izin · 0 nazıra verildi'; kullanılan grubu sil → soru penceresi.
