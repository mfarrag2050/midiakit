-- إضافات مطلوبة للمخطط — تُنشأ بمستخدم postgres الجذري (bootstrap)
-- مرة واحدة عند تهيئة القاعدة. مخرج «least privilege»: migration_user لا
-- يحتاج CREATE على القاعدة، فقط USAGE + CREATE على schema public.
--
-- pgcrypto → gen_random_uuid() (بديل uuid-ossp، contrib، رخصة PG)
-- citext   → نوع نصّي غير حسّاس لحالة الأحرف (email uniqueness)

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;
