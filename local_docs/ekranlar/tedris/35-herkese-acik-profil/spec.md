# 35 — Herkese açık profil

Kaynak: `local_docs/ekranlar/tedris/35-herkese-acik-profil/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/account/public-profile` (mevcut sayfa yok).

## 2. Gösterim

- Breadcrumb Hesap / Herkese açık profil; başlık + alt metin (künye ve cinsiyet dışındakiler varsayılan gizli).
- Künye ve cinsiyet ('Her zaman herkese açık'): İlmî künye* (kullanıcı adı gibi), Cinsiyet (Kadın/Erkek, radyo), açık rıza metni notu — metin içinde '[Açık rıza metninin adı]' yer tutucusu var, gerçek ad doğrulanamadı.
- Diğer bilgiler ('Varsayılan olarak gizli'): Ad ve soyad (salt okunur, Hesap'ta düzenlenir) + 'Herkese göster' anahtarı; Şehir + anahtar; Hakkında (metin alanı) + anahtar; Derslerin (ders adları listesi) + anahtar. Anahtar anında kaydedilir; metin alanları 'Kaydet' ile.
- 'Vazgeç', 'Kaydet'. Yan: 'BAŞKALARI BÖYLE GÖRÜR' önizlemesi (avatar, künye, cinsiyet, Hakkında, 'Gizli: …').
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Yükleniyor: iskelet.
- Künye boş/geçersiz: hata ('İlmî künye zorunlu'; metin doğrulanamadı); künye benzersizliği çakışması: hata (kural doğrulanamadı).
- Anahtar kaydı: iyimser, hata geri alır + Toast.
- Önizleme anında form durumundan çizilir.

## 4. Etkileşimler

- Anahtar: ilgili alanın görünürlüğünü anında yazar.
- 'Kaydet': künye, cinsiyet, şehir, hakkında metinlerini yazar.
- 'Vazgeç': değişiklikleri atar.
- 'Derslerin' listesi Derslerim'den gelir (ekran 20).

## 5. API

- YOK — yeni endpoint: `GET /me/public-profile`, `PATCH /me/public-profile` {kunye, gender, city, about, visibility:{fullName,city,about,courses}}; ayrıca başkalarının görmesi için `GET /users/:id/public-profile` (görünürlüğe göre süzülmüş). Backend'de kullanıcı/profil modeli yok (tedrisat/teskilat controller listesi: kosk, course, flashcard; kullanıcı yok).
- Dersler: `GET courses/enrolled` — apps/tedrisat/src/course/course.controller.ts:79 (mevcut).

## 6. Sınıf

**B** — B: yeni profil tablosu + 3 endpoint. Açık rıza metni içeriği hukuki içerik, kodla çözülemez (yer tutucu; doğrulanamadı).

## 7. Mevcut durum

Yok: profil ekranı ve görünürlük anahtarları yok.

## 8. Kabul kriterleri

1. Künye ve cinsiyet her zaman başkalarına görünür; bu alanlar için gizleme anahtarı yoktur.
2. Diğer alanlar varsayılan gizli gelir.
3. Anahtar değişimi sayfa yenilense de korunur; 'Başkaları böyle görür' önizlemesi gizli alanları 'Gizli: …' satırında listeler.
4. Başkasının profil çağrısı yalnız açık alanları döndürür.
5. Künye boşken Kaydet istek atmaz.

## 9. Test senaryoları

- Unit: önizleme gizli alan satırı üretimi; form şeması.
- E2E: giriş → Hesap → Herkese açık profil → Şehir anahtarını aç → B kullanıcısıyla profil çağrısı şehri içerir; kapatınca içermez.
