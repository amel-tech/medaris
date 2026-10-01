# 37 — Köşk açma başvurusu

Kaynak: `local_docs/ekranlar/tedris/37-kosk-acma-basvurusu/ekran.png`, `ekran.txt`. Genel kurallar: `local_docs/ekranlar/_kurallar.md`.

## 1. Amaç ve rota

- Nx projesi: `tedris-web`
- Rota: Önerilen: `/kosks/apply` (Keşfet'ten bağlantı; breadcrumb 'Keşfet / Köşk açma başvurusu'). Bugün yok.

## 2. Gösterim

- Başlık + alt metin (Medaris yönetimi inceler).
- Köşk: Köşk adı* (yardım), Alan* (seçim: Arapça dil ilimleri, Belâgat, Fıkıh, Fıkıh usûlü, Hadis, Kur'an ilimleri, Tefsir, Akaid ve kelâm, Siyer, Mantık, Diğer), Kısa açıklama*, Neden bu köşk*.
- İletişim: E-posta* (hesaptan dolu, değiştirilebilir), Telefon (isteğe bağlı); aydınlatma metni notu (Aydınlatma Metni bağlantısı — hedef doğrulanamadı).
- 'Vazgeç', 'Başvuruyu gönder'; 'Başvurundan sonra' 3 adımlı bilgi.
- Üst bar: Medaris logosu, Ana sayfa / Keşfet / Derslerim / Programım / Desteler, bildirim zili, avatar (baş harfler) + Hesabım. Başlık/metinler ekran.txt'ten birebir.

## 3. Durumlar

- Doğrulama: zorunlu alan boş → alan hatası (metin doğrulanamadı); e-posta biçimi; telefon biçimi.
- Gönderiliyor: busy.
- Başarı: onay sayfası/Toast + bildirim (ekran 36); metin tuvalde yok — doğrulanamadı.
- Sunucu hatası: Toast (kalıcı).
- Mükerrer bekleyen başvuru kuralı: doğrulanamadı.

## 4. Etkileşimler

- 'Başvuruyu gönder': başvuruyu yazar ve onay durumuna gider.
- 'Vazgeç': Keşfet'e döner.
- Aydınlatma Metni bağlantısı: ilgili metin.

## 5. API

- YOK — yeni endpoint: `POST /kosk-applications` {name, field, summary, reason, email, phone?} → 201 {id,status:'PENDING'}. Mevcut `POST kosks` doğrudan köşk oluşturur — apps/tedrisat/src/kosk/kosk.controller.ts:79 — başvuru değildir.
- İnceleme/onay (Medaris yönetimi) bu ekranın kapsamı dışı (yönetici ekranı; hangi uygulamada olduğu doğrulanamadı). Sonuç bildirimi ekran 36 ile bağlı.

## 6. Sınıf

**B** — B: başvuru tablosu + 1 yazma endpoint'i. Üçüncü parti yok; sonuç e-postası istenirse SMTP (C) ayrı konu.

## 7. Mevcut durum

Yok: başvuru formu bulunmuyor.

## 8. Kabul kriterleri

1. Zorunlu alanlar boşken gönderim engellenir; e-posta dolu gelir ve değiştirilebilir.
2. Alan listesi tuvaldeki 11 seçeneği içerir.
3. Gönderim sonrası başvuru PENDING olarak kaydedilir ve kullanıcı bilgilendirilir.
4. Telefon isteğe bağlıdır; boş gönderilebilir.
5. 'Vazgeç' hiçbir kayıt oluşturmaz.

## 9. Test senaryoları

- Unit: form şeması (zorunlu/e-posta/telefon).
- E2E: giriş → Keşfet → Köşk açma başvurusu → formu doldur → gönder → başarı durumu; API'de kayıt PENDING.
