# 11 — Yasaklamalar

Kaynak: `local_docs/ekranlar/nazir/11-yasaklamalar/ekran.png`, `ekran.txt`. Kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

Nx projesi: `nazir-web` (`apps/nazir`). Önerilen rota/dosya: apps/nazir/app/medrese/[medreseId]/yasaklamalar/page.tsx (öneri). Mevcut rota: yok (`apps/nazir/app` altında yalnız `layout.tsx`, `page.tsx`, `globals.css`, `favicon.ico`).

## 2. Gösterim

- Başlık ve sekme/segment: 'Etkin yasaklar' ve 'Kaldırılan' (sayaç 1); filtre 'Bütün kapsamlar / Medrese düzeyi / {ders adları}'.
- Tablo: Kişi (+ 'Yeni' rozeti, 'Kalıcı yasak talebi bekliyor'), Kapsam ('Ders · …' / 'Medrese · Süleymaniye Medresesi’nin bütün dersleri'), Gerekçe, Yasaklayan (ad + rol: 'Medrese nazırı', 'Medaris nazımı', 'Medrese başmüderrisi (siz)'), Tarih, İşlemler.
- İşlemler: 'Yasağı kaldır', 'Medreseden de yasakla', 'Kalıcı yasak talebi aç'; Medaris nazımının yasağında 'Bu yasağı yalnız Medaris yönetimi kaldırabilir.'

## 3. Durumlar

- Yükleniyor: tablo/kart yerine `Skeleton` (kural 6: Skeleton native bileşen).
- Boş: `EmptyState` bileşeni; metni tuvalde yok — doğrulanamadı (tasarım gerekir; geçici metin kullanılacaksa P4 placeholder).
- Hata: liste yüklenemezse `Alert` + 'Yeniden dene' (tuvalde metin yok, doğrulanamadı).
- Yetkisiz: kullanıcının bu kapsamda görevi/izni yoksa ekran açılmaz; hiç görevi yoksa 02 numaralı ekrana yönlenir; yalnız izne bağlı eylemler (düğmeler) gizlenir/disabled olur.

## 4. Etkileşimler

- 'Yasağı kaldır' → gerekçeli Dialog (kural 17/11).
- 'Medreseden de yasakla' → kapsam genişletme Dialog'u ('Yasakla' + RadioGroup kapsam).
- 'Kalıcı yasak talebi aç' → talep (gerekçe*) Medaris yönetimine.
- Filtre kapsamı daraltır.

## 5. API

- YOK — yeni endpoint: `GET /madrasahs/:id/bans?state=active|lifted&scope`, `POST /madrasahs/:id/bans`, `POST /bans/:id/lift` {reason}, `POST /bans/:id/escalate` (medrese düzeyi), `POST /bans/:id/permanent-request`. Kanıt: Medrese (madrasah) varlığı için tablo, controller ya da servis YOK: `apps/tedrisat/src` altında yalnız `app`, `course`, `kosk`, `flashcard` modülleri var; `apps/teskilat/src` yalnız `app.controller.ts` (health) içeriyor. Yetki matrisinde `ENTITIES.MADRASAH` tanımlı ama `apps/tedrisat/src/authz/tedrisat-role-resolver.service.ts` bu varlık için şimdilik koşulsuz `PUBLIC` döndürüyor (`libs/common/src/authz/auth-matrix.ts:121-124` yorumu: 'UNREACHABLE (MDRS-41) ... until the nazır tables land'). Sabitlerde yasak kapsamı yok (`libs/common/src/authz/scopes.ts` tarandı: BAN içeren scope bulunmadı — doğrulanamadı: dosyanın tamamı satır satır okunmadı).

## 6. Sınıf

**B** — Yasak/ban modeli ve kademe (ders/medrese/köşk/Medaris) kuralları backend'de yok; yeni tablo + uçlar → B.

## 7. Mevcut durum

`apps/nazir` yalnız `create-next-app` iskeleti: `apps/nazir/app/layout.tsx` (Inter fontu, `lang="en"`), `apps/nazir/app/page.tsx` (Next.js karşılama metni), `apps/nazir/app/globals.css`. Medrese/nazır ekranı, rota, API istemcisi, i18n anahtarı yok; `libs/i18n/src/locales/tr/nazir.json` yalnız `nazir-namespace-placeholder` anahtarını taşıyor. Bu ekran için kodlanmış bir şey yok.

## 8. Kabul kriterleri

1. Etkin ve kaldırılmış yasaklar ayrı listelenir; sayaç doğru.
2. Kademeye göre eylemler gösterilir: üst kademe (Medaris) yasağı kaldırılamaz, düğme yok ve not görünür.
3. 'Medreseden de yasakla' ders yasağını medrese kapsamına genişletir.
4. Kaldırma gerekçesi zorunludur; denetim kaydı yazılır.
5. 'Yeni' rozeti son 24 saat (kural tuvalde belirtilmemiş, doğrulanamadı).

## 9. Test senaryoları

- Unit: kademe → görünür eylem matrisi.
- Playwright: ders yasağı seed → 'Medreseden de yasakla' → kapsam 'Medrese' olur; 'Yasağı kaldır' → gerekçe → Kaldırılan sekmesine geçer.
