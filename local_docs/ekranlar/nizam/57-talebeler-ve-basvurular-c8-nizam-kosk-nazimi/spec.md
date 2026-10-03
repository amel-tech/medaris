# 57 — talebeler-ve-basvurular-c8-nizam-kosk-nazimi

## 1. Amaç ve rota

- Nx projesi: `nizam-web`
- Dersin başvurularını karara bağlama ve kayıtlı talebeleri izleme sayfası (C8); bu görünümde "Onay bekleyen başvurular" sekmesi. Önerilen rota: `/[locale]/kosks/[koskId]/courses/[courseId]/students`. Mevcut rota yok.
- Tuval verisi örnektir (example.com adresleri, sabit tarihler); gerçek veri API'den gelir. Bu belgedeki "ekran.txt" alıntıları tuvalden alınmıştır.

## 2. Gösterim

- Başlık "Talebeler", açıklama; sekmeler: Başvurular 2, Kayıtlı 28, Tamamlayanlar 2, Erişimi kaldırılanlar 6.
- Bilgi: "Bu derse kayıt için onayınız gerekiyor. Onayladığınız talebe celselere ve ders kayıtlarına hemen erişir; reddettiğiniz talebe yeniden başvurabilir."
- Tablo "Onay bekleyen başvurular": Talebe (avatar, ad), E-posta, Başvuru (Dün 21:14), İşlemler: Onayla, Reddet.

## 3. Durumlar

- Boş: "Onay bekleyen başvuru yok" (doğrulanamadı). Yükleniyor/hata: standart.
- Yetkisiz: ders sahibi olmayan 404/403.
- Onay gerekmeyen derste (`requiresApproval=false`) Başvurular sekmesi boş/gizli (course.schema.ts:43).

## 4. Etkileşimler

- Onayla: kaydı ENROLLED yapar; Reddet: başvuruyu siler (talebe yeniden başvurabilir). Başarıda satır düşer, sekme sayacı güncellenir, Toast.
- Sekme geçişi diğer listeleri (58) gösterir.

## 5. API

| Veri / aksiyon | Durum | Kanıt / öneri |
|---|---|---|
| Bekleyen başvurular | VAR | `apps/tedrisat/src/course/course.controller.ts:175` — `GET kosks/:koskId/enrollments/pending` (köşk bazlı; ders süzgeci istemcide) |
| Onayla | VAR | `apps/tedrisat/src/course/course.controller.ts:196` — `POST courses/:id/enrollments/:userId/approve` → `apps/tedrisat/src/course/course.service.ts:131` |
| Reddet | VAR | `apps/tedrisat/src/course/course.controller.ts:211` — `DELETE courses/:id/enrollments/:userId` (yalnız PENDING, apps/tedrisat/src/course/course.service.ts:148-161) |
| Sekme sayaçları (Kayıtlı/Tamamlayan/Erişimi kaldırılan) | YOK — yeni endpoint | `GET /courses/:id/enrollments/summary` önerilir; "Erişimi kaldırılan" için kaldırma kaydı modeli yok. |

## 6. Sınıf

**A** — Bu ekranın asıl işi (başvuru listele/onayla/reddet) mevcut uçlarla yapılır; sayaçlar istemcide hesaplanabilir veya sonraki ekran (58) ile birlikte genişler. Mevcut frontend aynı uçları zaten çağırıyor.

## 7. Mevcut durum

Kısmi: `apps/nizam/features/kosks/components/pending-requests.tsx` (onayla/reddet, satır 104-116) ve `actions/courses.ts:40-62`; ders bazlı Talebeler sayfası/sekmeleri yok.

## 8. Kabul kriterleri

1. Bekleyen başvurular tabloda ad, e-posta ve göreli zamanla listelenir.
2. Onayla → `POST …/approve` 201, satır düşer, Kayıtlı sayısı +1 (sekme).
3. Reddet → `DELETE …/enrollments/:userId` 200, satır düşer.
4. Başka dersin başvuruları bu sayfada görünmez.
5. Sahip olmayan kullanıcı uçlardan 404/403 alır ve sayfa hata durumu gösterir.

## 9. Test senaryoları

- Unit: ders süzgeci, sekme sayaçları, aksiyon sonrası optimistik güncelleme.
- Backend e2e: mevcut `course.e2e.spec.ts` (approve/reject).
- Playwright: talebe hesabıyla derse başvur → köşk nazımı → Talebeler → Başvurular → Onayla → talebe hesabında ders kayıtlı görünür.
