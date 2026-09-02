# services/diacritizer

خدمة تشكيل عربي معزولة — FastAPI ملفوفة حول
[`arabic-diacritizer`](https://pypi.org/project/arabic-diacritizer/) (MIT).

## قواعد معمارية

- **معزولة عن المحرك.** `packages/engine` بلا أي تبعية بايثون.
- **تكامل خارج المحرك.** التشكيل يجري على النص **قبل** تمريره لـ
  `renderFrame`. المحرك يعامل النص المشكّل كنصّ عربي عادي.
- **معطّلة افتراضياً.** لا تُشغَّل تلقائياً في CI أو الاختبارات.
  التشغيل يدوي في التطوير عند الحاجة.
- **`brand.typography.diacritics.enabled = false`** في `DEFAULT_BRAND`.

## المتطلّبات

- Python **3.10 – 3.12** (الحزمة لا تدعم 3.13+ بعد).
  الميني: `/opt/homebrew/opt/python@3.12/bin/python3.12` (مثبّت عبر brew).

## الإعداد لأوّل مرة

```bash
cd services/diacritizer
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .
```

التحميل الأوّل يجرّ arabic-diacritizer (~47MB مع النموذج والكاش).

## التشغيل

```bash
cd services/diacritizer
source .venv/bin/activate
uvicorn diacritizer_service.main:app --host 127.0.0.1 --port 19080
```

المنفذ **19080** من نطاق pf-mediakit المخصّص (19000-19099).

## الاختبار السريع

```bash
curl -s http://127.0.0.1:19080/health

curl -s -X POST http://127.0.0.1:19080/diacritize \
  -H 'content-type: application/json' \
  -d '{"text":"بسم الله الرحمن الرحيم"}'
```

## التكامل من طرف preview

```bash
# تُشغَّل الخدمة في نافذة terminal، ثم:
pnpm preview -- --diacritize --template=breaking
```

عند تعذّر الوصول للخدمة (منفذ مغلق، نموذج لم يجهز): تحذير في stderr،
والنص يُمرَّر كما هو — بلا فشل. راجع L-04 (الرمي عند حدود النظام،
التسامح في مسارات الرسم).

## الرخصة

- الحزمة `arabic-diacritizer`: MIT (Zain Mahmood).
- خدمة الغلاف هذه: تحت رخصة المشروع الرئيسي.

راجع `ATTRIBUTIONS.md` في جذر المستودع.
