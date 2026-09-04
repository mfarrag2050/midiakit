# services/face-detector

خدمة معزولة لكشف الوجوه في الصور المرفوعة — تُنتج إحداثيات JSON
يستهلكها `packages/engine/src/layers/smart-crop.ts` عند الرندر.

## المبدأ (L-07)

الكشف يجري **مرة واحدة عند الرفع** ثم تُخزَّن الإحداثيات مع الصورة.
مسار الرندر لا يستدعي هذه الخدمة — يقرأ حقل `faces[]` من بيانات الأصل.

## البنية

- FastAPI (Python 3.10–3.12)
- MTCNN (MIT) — CPU-only، بلا GPU
- TensorFlow (Apache-2.0) — تبعية لـMTCNN
- Pillow — قراءة الصور

## المنفذ

**19082** — يتبع نطاق pf-mediakit (19080=diacritizer, 19081=transcriber).

## التشغيل

```bash
cd services/face-detector
python3.12 -m venv .venv
source .venv/bin/activate
pip install -e .
python -m face_detector_service.app
```

## الاستخدام

```bash
curl -F "file=@image.jpg" http://127.0.0.1:19082/detect
```

**المخرج:**
```json
{
  "width": 1200,
  "height": 800,
  "faces": [
    { "x": 340, "y": 210, "w": 180, "h": 220, "score": 0.99 }
  ],
  "elapsed_ms": 340
}
```

## الاختبار الآلي

سيُضاف في المرحلة 4 عند بناء واجهة الرفع.

## الأداء المتوقّع

- MTCNN CPU على معالج M2/i7: **200-500ms** لصورة 1080×1920.
- **غير مسار زمن-حرج** (يجري وقت الرفع، لا الرندر).
- استهلاك ذاكرة: ~1GB مع تحميل TF (lazy).

## الرخصة

- `mtcnn` (Python): MIT — https://github.com/ipazc/mtcnn
- `tensorflow`: Apache-2.0 — تبعية transitive
- `fastapi`, `uvicorn`, `Pillow`: MIT/BSD

مسجَّل في `ATTRIBUTIONS.md §خدمة كشف الوجوه`.
