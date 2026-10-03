# 43 — kullanici-secici-c12-durumlari

## 1. Amaç ve rota

- Nx projesi: `libs/ui + nizam-web`
- Kişi atanan her ekranda (köşk nazımı, başmüderris, müderris, Medaris/medrese/ders nazırı) kullanılan ortak Kullanıcı seçici (C12) bileşeninin durum envanteri. Kişi yalnız kayıtlı hesabının tam e-posta adresiyle bulunur. Ayrı rota yok; bileşen `libs/ui` (örn. `libs/ui/src/components/user-picker.tsx`, yok) ve çağıran pencereler (Müderrisleri düzenle vb.).
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Alan etiketi (örn. "Müderris"), tek satır e-posta girişi, yardım metni "Kayıtlı hesabın e-posta adresini eksiksiz yazın; her arama denetim kaydına yazılır."
- Durumlar: arama boş; aranıyor (tek satır iskelet); sonuç var ("1 kişi bulundu", avatar+ad+e-posta, Enter/tık seçer); sonuç yok ("Bu e-postayla kayıtlı kullanıcı yok; kişinin önce Medaris’e kaydolması gerekir."); zaten atanmış ("Zaten müderris", satır seçilemez); seçildi (alan boşalır, "Seçilen müderrisler" listesi, "X seçildi" duyurusu); zaten seçili; geçersiz adres ("Geçerli bir e-posta adresi yazın."); arama yapılamadı ("Kısa sürede çok sayıda arama yapıldı. Bir dakika sonra yeniden deneyin.").
- Denetim notu paneli: arama her zaman kapsam içinde yapılır (köşk nazımı kendi köşkünde, başmüderris kendi medresesinde, müderris kendi dersinde, Medaris başnazımı platformda); ad/adres parçasıyla arama yok; denetim kaydı örneği (#48271 Kullanıcı arama).

## 3. Durumlar

- Tüm 8 durum yukarıda; ek olarak: ağ hatası (genel hata — metin tuvalde yok, doğrulanamadı); yetkisiz kapsam (403 — metin doğrulanamadı).
- Doğrulama: yalnız tam e-posta biçimi gönderilir; adres tamamlanmadan istek atılmaz.

## 4. Etkileşimler

- E-posta tamamlanınca (geçerli biçim) arama başlar; sonuçta Enter ya da tıklama seçer.
- Seçilen kişi alan altı listeye girer; satırda kaldırma (X) davranışı tuvalde belirtilmemiş — doğrulanamadı.
- Rate limit: sunucu 429 döner, UI "Arama yapılamadı" gösterir.
- Seçici hesap açmaz, davet göndermez.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| E-postayla kullanıcı arama | YOK — yeni endpoint | `GET /users/lookup?email=&scope=kosk:{id}` → `{ id, name, email } / 404`. Backend'de kullanıcı tablosu yok: tedrisat yalnız `enrollments.student_email` saklar (`apps/tedrisat/src/database/schema/course.schema.ts:128`); kayıtlı hesap dizini Keycloak'tadır. Backend'de yasaklama/moderasyon modülü YOK: apps/tedrisat/src altında yalnız app, authz, config, course, database, flashcard, kosk, openapi dizinleri var; grep ile ban/yasak/bildirim/celse-kaydı bulunamadı (doğrulandı: course.controller.ts, kosk.controller.ts, flashcard*.controller.ts tek controller seti). |
| Denetim kaydı | YOK | Her arama denetim kaydına yazılmalı; denetim modülü backend'de yok (doğrulandı). |
| Oran sınırı | YOK | 429 davranışı için throttler yapılandırması tedrisat'ta bulunamadı (doğrulanamadı). |

## 6. Sınıf

**C** — Kayıtlı hesap dizini Keycloak'ta; e-postayla tam eşleşme için Keycloak admin REST'e (view-users yetkili servis hesabı, realm yapılandırması) erişim gerekir — üçüncü parti sunucu yapılandırması ve insan kararı. Yerel kullanıcı tablosu bu repoda yok; ilk giriş senkronu tasarlanana dek kodlanamaz.

## 7. Mevcut durum

Yok. libs/ui'da kullanıcı seçici bileşeni bulunmuyor (_kurallar.md madde 22: "Combobox ... kullanıcı seçici C12" yeni Base UI bileşeni, tasarım sisteminde henüz yok).

## 8. Kabul kriterleri

1. Bileşen sekiz durumu tuvaldeki metinlerle çizer.
2. Geçersiz e-posta için istek atılmaz.
3. Zaten atanmış/seçili kişi seçilemez ve nedeni görünür.
4. 429 yanıtı "Arama yapılamadı" durumunu gösterir.
5. Seçim sonrası alan boşalır ve seçilenler listesinde görünür.
6. Klavye: Enter seçer, Esc listeyi kapatır; durum değişiklikleri ekran okuyucuya duyurulur.

## 9. Test senaryoları

- Unit: durum makinesi (boş→aranıyor→sonuç/yok/zaten), debounce yok (tamamlanınca arama), rate-limit.
- Playwright (backend + Keycloak hazır olduğunda): bilinen e-posta → sonuç; bilinmeyen → sonuç yok; çoklu seçim tekrarı → zaten seçili. Keycloak admin erişimi yapılandırılana dek çalıştırılamaz.
