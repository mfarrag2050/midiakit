# services/transcriber

خدمة تفريغ عربي مع تزمين — FastAPI ملفوفة حول
[`faster-whisper`](https://github.com/SYSTRAN/faster-whisper) (MIT).

## قواعد معمارية

- **معزولة عن المحرك.** `packages/engine` بلا أيّ تبعية بايثون.
- **تكامل خارج المحرك.** التفريغ يجري خارج مسار الرندر، ويُعطي المحرك
  نصّاً موقوتاً كمُدخَل content عادي.
- **معطّلة افتراضياً.** لا تُشغَّل تلقائياً في CI أو الاختبارات.
  التشغيل يدوي في التطوير عند الحاجة.
- **النموذج القياسي `small` أوّلاً** (قرار المالك 2026-09-03).
  244 MB على القرص. الفارق مع base (74 MB) قد يبرّر الحجم — يُقاس.

## الرخص المفحوصة

| المكوّن | الرخصة |
|---|---|
| faster-whisper 1.2.1 | MIT |
| ctranslate2 (محرك الاستدلال) | MIT |
| huggingface-hub | Apache-2.0 |
| tokenizers | Apache-2.0 |
| onnxruntime | MIT |
| PyAV (av — قراءة الصوت) | BSD-3-Clause |
| Whisper (OpenAI) | MIT |

كل التبعيات متسامحة — لا GPL في السلسلة.

## المتطلّبات

- Python **3.10 – 3.12** (نفس نطاق diacritizer).
- ffmpeg للنظام (لبعض تنسيقات الصوت التي يستدعيها PyAV).
- ~500 MB مساحة قرص (النموذج small + الاعتماديات).

## الإعداد لأوّل مرة

```bash
cd services/transcriber
/opt/homebrew/opt/python@3.12/bin/python3.12 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -e .

# للتقييم على Common Voice (اختياري):
pip install -e '.[eval]'
```

## التشغيل

```bash
source .venv/bin/activate
uvicorn transcriber_service.app:app --host 127.0.0.1 --port 19081 --reload
```

**المنفذ 19081** — ضمن نطاق pf-mediakit (19000-19099)، بجانب diacritizer:19080.

## اختبار سريع

```bash
curl -X POST http://127.0.0.1:19081/health
curl -X POST http://127.0.0.1:19081/transcribe \
  -F "file=@sample.wav" \
  -F "language=ar" \
  -F "model_size=small"
```

## القياس على Common Voice Arabic

`scripts/eval-transcription.py` يُنزّل عيّنة من Common Voice 19.0
(mozilla, **CC0**)، يفرّغها عبر الخدمة، ويحسب WER لكل عيّنة والوسيط
على المجموعة.

**قاعدة (L-41 · L-34):** الرقم المنشور = «وسيط WER على Common Voice
Arabic (أصوات بشرية · لهجات متنوعة · CC0) — X% (Y عيّنة، Z تاريخ)».
لا «دقة تفريغ عربي» مطلقاً.
