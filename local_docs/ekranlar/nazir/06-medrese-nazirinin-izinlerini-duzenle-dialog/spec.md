# 06 — Medrese nazırının izinlerini düzenle (dialog)

Kaynak: `local_docs/ekranlar/nazir/06-medrese-nazirinin-izinlerini-duzenle-dialog/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: 05 üzerinde Dialog (apps/nazir/app/medrese/[medreseId]/nazirlar/_izin-dialog.tsx, öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Dialog 'İzinleri düzenle' (üst etiket 'SÜLEYMANİYE MEDRESESİ'); nazır başlığı (monogram, ad, e-posta mono, 'Medrese nazırı · Atayan: … · tarih').
- 'Hazır izin grubu' Select (isteğe bağlı; 'Grup yok' + gruplar). Seçilen grubun izinleri işaretli ve kilitli gelir ('Gruptan gelir.').
- 'İzinler' → 'Medrese' (10 izin: Medrese dersi aç; Müderris ekle ya da çıkar; imamı değiştir; Medresenin talebelerini gör; Medrese düzeyinde yasakla…; Medrese derslerini gizle, geri al; Kabul kurallarını belirle; Köşk kararına itiraz aç; Kalıcı yasak talebi aç; Medrese ayarlarını ve politikalarını değiştir; Medrese nazırı ata).
- 'Medrese dersleri' → 'Hangi derslerde' Select (Bütün medrese dersleri / tek tek dersler; not 'Bütün medrese dersleri, sonradan açılacak dersleri de kapsar.') + ders izinleri (ekran.txt'de 20 madde).
- 'Bitiş tarihi (isteğe bağlı)' (boş = süresiz; 'Tarih geçince izin kendiliğinden düşer.'). Not: 'Aldığı izni başkasına veremez. Verilen ve geri alınan her izin denetim kaydına yazılır.'
- Alt çubuk 'Gruptan 4 izin ve 1 ek izin'; 'Vazgeç' / 'Kaydet'.

## 3. Durumlar

- Yükleniyor: grup ve izin listesi yüklenirken iskelet.
- Yetki: yalnız verenin sahip olduğu izinler seçilebilir; fazlası disabled (05'teki 'Yalnız verebileceğiniz izinler listelenir' ile aynı kural — 16'da yazılı).
- Doğrulama: bitiş tarihi geçmişte olamaz (hata metni tuvalde yok, doğrulanamadı).
- Odak: formda ilk alan (kural 13); perdeyle kapanmaz (kural 20, doğrulanmadı).

## 4. Etkileşimler

- Grup seçimi → grup izinleri işaretlenip kilitlenir.
- Ek izinler ayrıca işaretlenir; 'Hangi derslerde' kapsamı ders izinlerinin geçtiği dersleri belirler.
- 'Kaydet' → izin kümesini yazar, 05 satırı güncellenir, denetim kaydı.
- 'Vazgeç' / ✕ → kapatır (değişiklik atılır).

## 5. API

- YOK — yeni endpoint: `PUT /madrasahs/:id/nazirs/:userId/permissions` {groupId?, extraPermissions[], courseScope, expiresAt?}; izin sözlüğü `GET /madrasahs/:id/permissions` (verenin verebildikleri). Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land').

## 6. Sınıf

**B** — Nazıra izin verme/geri alma ve grup+ek izin birleşimi yeni modeldir; backend yok → B. Kural 15: 4 Ekim 2026'ya kadar pencere açılmaz (sürüm kapısı).

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Grup seçince grup izinleri işaretli+kilitli gelir, ek izin işaretlenebilir.
2. Veren sahip olmadığı izni veremez (UI disabled + sunucu 403).
3. Bitiş tarihi geçince izin otomatik düşer (sunucu zaman kontrolü).
4. 'Kaydet' sonrası 05 satırındaki grup/ek izin özeti güncellenir.
5. Her değişiklik denetim kaydına yazılır.

## 9. Test senaryoları

- Unit: grup+ek izin birleşim hesabı, verenin izin kesişimi.
- Playwright: 05 → 'İzin ver' → grup seç + ek izin → Kaydet → satırda grup çipi ve 'Ayrıca 1 izin'.
- Playwright: izinsiz izin için PUT 403.
