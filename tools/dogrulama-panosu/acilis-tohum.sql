-- Açılış demosu tohumu (Taha Hoca'nın kapsamı): 4 köşk, 1 medrese, 6 ders, celseler.
-- Yalnız yerel acilis_db için. Zamanlar now()'a göre: yeniden çalıştırınca celseler yeniden "yakın" olur.
-- Kullanım: docker exec -i medaris-linux-medaris-db-1 psql -U postgres -d acilis_db -v ON_ERROR_STOP=1 < acilis-tohum.sql
BEGIN;

-- Temizlik (idempotent)
DELETE FROM enrollments WHERE course_id::text LIKE 'ac000000-%';
DELETE FROM kosk_followers WHERE kosk_id::text LIKE 'ac000000-%';
DELETE FROM role_assignments WHERE scope_id::text LIKE 'ac000000-%' OR role = 'MEDARIS_NAZIM';
DELETE FROM lessons WHERE week_id::text LIKE 'ac000000-%';
DELETE FROM course_weeks WHERE id::text LIKE 'ac000000-%';
DELETE FROM course_muderris WHERE course_id::text LIKE 'ac000000-%';
DELETE FROM courses WHERE id::text LIKE 'ac000000-%';
DELETE FROM madrasah_kosk_hosting WHERE madrasah_id::text LIKE 'ac000000-%';
DELETE FROM madrasahs WHERE id::text LIKE 'ac000000-%';
DELETE FROM kosks WHERE id::text LIKE 'ac000000-%';

-- Kullanıcılar: e2e hesapları (Keycloak sub ile aynı) + iki müderris
INSERT INTO users (id, email, email_verified, given_name, family_name) VALUES
  ('94914cc2-cd96-4826-b0c0-b48eff986722','e2e-talebe@example.test',true,'Ahmet','Talebe'),
  ('1d5c92b5-cd0f-4940-8410-5292b0d72f78','e2e-muderris@example.test',true,'Yusuf','Kılıç'),
  ('1ac4a753-19b1-434c-add0-45bc86b0ece7','e2e-kosk-nazim@example.test',true,'E2E','Köşk Nâzımı'),
  ('81d282fe-1057-4bc9-a706-c0794d8130b8','e2e-medrese-nazir@example.test',true,'E2E','Medrese Nâzırı'),
  ('49fc7081-cf3a-4bb5-982c-a2e7d496ec63','e2e-sistem-admin@example.test',true,'E2E','Sistem Admini'),
  ('a4479390-4b9b-4a8a-8d54-ddc6d94d7d63','e2e-medrese-basmuderris@example.test',true,'Mehmet Emin','Işıkoğlu'),
  ('d0e4e51d-3397-4371-80ca-4c776b02ac2a','e2e-ders-nazir@example.test',true,'E2E','Ders Nâzırı'),
  ('a85b0301-4138-4f1c-afd6-477ee02abc63','e2e-medaris-nazim@example.test',true,'E2E','Medaris Nâzımı'),
  ('ac000000-0000-4000-8000-0000000000f1',NULL,true,'Abdülhamit','Karaosmanoğlu')
ON CONFLICT (id) DO NOTHING;

-- 4 köşk
INSERT INTO kosks (id, owner_id, name, handle, field, level, description, verified) VALUES
  ('ac000000-0000-4000-8000-0000000000a1','a85b0301-4138-4f1c-afd6-477ee02abc63','Nûruosmaniye Köşkü','nuruosmaniye','Arapça','BEGINNER','Sarf ve nahiv derslerinin köşkü.',true),
  ('ac000000-0000-4000-8000-0000000000a2','a85b0301-4138-4f1c-afd6-477ee02abc63','Fatih Köşkü','fatih','Fıkıh','INTERMEDIATE','Fıkıh ve mantık dersleri.',true),
  ('ac000000-0000-4000-8000-0000000000a3','a85b0301-4138-4f1c-afd6-477ee02abc63','Beyazıt Köşkü','beyazit','Siyer','BEGINNER','Siyer ve hadis okumaları.',true),
  ('ac000000-0000-4000-8000-0000000000a4','a85b0301-4138-4f1c-afd6-477ee02abc63','Üsküdar Köşkü','uskudar','Akaid','ALL','Akaid dersleri.',true);

-- 1 medrese + barındırdığı köşkler
INSERT INTO madrasahs (id, handle, name, description, created_by) VALUES
  ('ac000000-0000-4000-8000-0000000000b1','suleymaniye','Süleymaniye Medresesi','Açılışın medresesi: alet ilimlerinden akaide.','a85b0301-4138-4f1c-afd6-477ee02abc63');
INSERT INTO madrasah_kosk_hosting (madrasah_id, kosk_id, granted_by) VALUES
  ('ac000000-0000-4000-8000-0000000000b1','ac000000-0000-4000-8000-0000000000a1','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('ac000000-0000-4000-8000-0000000000b1','ac000000-0000-4000-8000-0000000000a2','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('ac000000-0000-4000-8000-0000000000b1','ac000000-0000-4000-8000-0000000000a4','a85b0301-4138-4f1c-afd6-477ee02abc63');

-- 6 ders
INSERT INTO courses (id, kosk_id, madrasah_id, author_id, title, subtitle, description, category, status, requires_approval, duration_weeks, time_zone) VALUES
  ('ac000000-0000-4000-8000-0000000000c1','ac000000-0000-4000-8000-0000000000a1','ac000000-0000-4000-8000-0000000000b1','a85b0301-4138-4f1c-afd6-477ee02abc63','Emsile ve Bina','Sarfa giriş','Fiil kalıpları ve çekimleri.','الصرف','PUBLISHED',false,12,'Europe/Istanbul'),
  ('ac000000-0000-4000-8000-0000000000c2','ac000000-0000-4000-8000-0000000000a1',NULL,'a85b0301-4138-4f1c-afd6-477ee02abc63','Avâmil','Nahve giriş','Âmiller ve irab.','النحو','PUBLISHED',true,10,'Europe/Istanbul'),
  ('ac000000-0000-4000-8000-0000000000c3','ac000000-0000-4000-8000-0000000000a2','ac000000-0000-4000-8000-0000000000b1','a85b0301-4138-4f1c-afd6-477ee02abc63','İsâgûcî ile mantığa giriş','Mantık','Tarifler ve kıyas.','المنطق','PUBLISHED',true,8,'Europe/Istanbul'),
  ('ac000000-0000-4000-8000-0000000000c4','ac000000-0000-4000-8000-0000000000a2',NULL,'a85b0301-4138-4f1c-afd6-477ee02abc63','Mülteka okumaları','Hanefî fıkhı','Taharet ve namaz bahisleri.','الفقه','PUBLISHED',false,14,'Europe/Istanbul'),
  ('ac000000-0000-4000-8000-0000000000c5','ac000000-0000-4000-8000-0000000000a3',NULL,'a85b0301-4138-4f1c-afd6-477ee02abc63','Siyer okumaları','Mekke dönemi','Peygamberimizin hayatı.','السيرة','PUBLISHED',false,10,'Europe/Istanbul'),
  ('ac000000-0000-4000-8000-0000000000c6','ac000000-0000-4000-8000-0000000000a4','ac000000-0000-4000-8000-0000000000b1','a85b0301-4138-4f1c-afd6-477ee02abc63','Emâlî şerhi','Akaid','Ehl-i sünnet akaidi.','العقيدة','PUBLISHED',false,10,'Europe/Istanbul');

INSERT INTO course_muderris (course_id, user_id, name, title, order_index) VALUES
  ('ac000000-0000-4000-8000-0000000000c1','ac000000-0000-4000-8000-0000000000f1','Abdülhamit Karaosmanoğlu','İmam',0),
  ('ac000000-0000-4000-8000-0000000000c2','ac000000-0000-4000-8000-0000000000f1','Abdülhamit Karaosmanoğlu','İmam',0),
  ('ac000000-0000-4000-8000-0000000000c3','1d5c92b5-cd0f-4940-8410-5292b0d72f78','Yusuf Kılıç','Müderris',0),
  ('ac000000-0000-4000-8000-0000000000c4','1d5c92b5-cd0f-4940-8410-5292b0d72f78','Yusuf Kılıç','Müderris',0),
  ('ac000000-0000-4000-8000-0000000000c5','ac000000-0000-4000-8000-0000000000f1','Abdülhamit Karaosmanoğlu','İmam',0),
  ('ac000000-0000-4000-8000-0000000000c6','a4479390-4b9b-4a8a-8d54-ddc6d94d7d63','Mehmet Emin Işıkoğlu','Başmüderris',0);

-- Her derse 2 hafta: 1. hafta geçmiş celse, 2. hafta yaklaşan celse
INSERT INTO course_weeks (id, course_id, week_number, title, order_index)
SELECT ('ac000000-0000-4000-8000-0000000000' || c || w)::uuid, ('ac000000-0000-4000-8000-0000000000c' || c)::uuid, w, CASE w WHEN 1 THEN 'Giriş' ELSE 'İkinci hafta' END, w - 1
FROM generate_series(1, 6) c, generate_series(1, 2) w;
-- Not: hafta id'leri 'ac000000-…-0000000' || c || w → örn. ...000000000011 (ders 1, hafta 1)

INSERT INTO lessons (week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, kaynak)
SELECT ('ac000000-0000-4000-8000-0000000000' || c || '1')::uuid, 'Tanışma celsesi', 'LIVE', 0, 60,
       date_trunc('minute', now()) - interval '6 days' + (c || ' hours')::interval, 'https://zoom.us/j/9876543210', 'Ders kitabı, giriş'
FROM generate_series(1, 6) c;

INSERT INTO lessons (week_id, title, type, order_index, duration_minutes, scheduled_at, meeting_url, kaynak) VALUES
  ('ac000000-0000-4000-8000-000000000012','Fiil kalıpları — 2. celse','LIVE',0,60, date_trunc('minute', now()) + interval '8 minutes','https://zoom.us/j/9876543210','Emsile, s. 3–7'),
  ('ac000000-0000-4000-8000-000000000022','Âmil nedir','LIVE',0,60, date_trunc('minute', now()) + interval '1 day 2 hours','https://meet.google.com/abc-defg-hij','Avâmil, ilk bahis'),
  ('ac000000-0000-4000-8000-000000000032','Tarifler','LIVE',0,90, date_trunc('minute', now()) + interval '2 days','https://zoom.us/j/1234567890','İsâgûcî, Kâtib Çelebi şerhi'),
  ('ac000000-0000-4000-8000-000000000042','Taharet bahsi','LIVE',0,60, date_trunc('minute', now()) + interval '3 days','https://meet.google.com/xyz-abcd-efg','Mülteka, Kitâbü’t-tahâre'),
  ('ac000000-0000-4000-8000-000000000052','Hicret','LIVE',0,60, date_trunc('minute', now()) + interval '2 hours',NULL,'Siyer, Mekke dönemi sonu'),
  ('ac000000-0000-4000-8000-000000000062','Allah’ın sıfatları','LIVE',0,60, date_trunc('minute', now()) + interval '4 days','https://zoom.us/j/5556667777','Emâlî, 1–5. beyitler');

-- Roller (e2e hesapları açılış kapsamına bağlanır)
INSERT INTO role_assignments (user_id, role, scope_type, scope_id, granted_by) VALUES
  ('a85b0301-4138-4f1c-afd6-477ee02abc63','MEDARIS_NAZIM','platform',NULL,'a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('1ac4a753-19b1-434c-add0-45bc86b0ece7','KOSK_NAZIM','kosk','ac000000-0000-4000-8000-0000000000a1','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('1d5c92b5-cd0f-4940-8410-5292b0d72f78','MUDERRIS','course','ac000000-0000-4000-8000-0000000000c3','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('1d5c92b5-cd0f-4940-8410-5292b0d72f78','MUDERRIS','course','ac000000-0000-4000-8000-0000000000c4','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('d0e4e51d-3397-4371-80ca-4c776b02ac2a','DERS_NAZIR','course','ac000000-0000-4000-8000-0000000000c1','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('81d282fe-1057-4bc9-a706-c0794d8130b8','MEDRESE_NAZIR','madrasah','ac000000-0000-4000-8000-0000000000b1','a85b0301-4138-4f1c-afd6-477ee02abc63'),
  ('a4479390-4b9b-4a8a-8d54-ddc6d94d7d63','MEDRESE_BASMUDERRIS','madrasah','ac000000-0000-4000-8000-0000000000b1','a85b0301-4138-4f1c-afd6-477ee02abc63');

-- Talebe: 2 derse kayıtlı, 1 derste başvurusu bekliyor, 1 köşkü takip ediyor; diğer 3 dersi başvuru için boş
INSERT INTO enrollments (user_id, course_id, status, progress, student_name, student_email) VALUES
  ('94914cc2-cd96-4826-b0c0-b48eff986722','ac000000-0000-4000-8000-0000000000c1','ENROLLED',15,'Ahmet Talebe','e2e-talebe@example.test'),
  ('94914cc2-cd96-4826-b0c0-b48eff986722','ac000000-0000-4000-8000-0000000000c5','ENROLLED',10,'Ahmet Talebe','e2e-talebe@example.test'),
  ('94914cc2-cd96-4826-b0c0-b48eff986722','ac000000-0000-4000-8000-0000000000c3','PENDING',0,'Ahmet Talebe','e2e-talebe@example.test');
INSERT INTO kosk_followers (user_id, kosk_id) VALUES
  ('94914cc2-cd96-4826-b0c0-b48eff986722','ac000000-0000-4000-8000-0000000000a1');

COMMIT;
