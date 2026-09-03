"""FastAPI app — POST /transcribe يستقبل ملف صوت، يُعيد نصّاً موقوتاً.

**قواعد معمارية:**
- معزولة عن `packages/engine` (لا تبعية بايثون في المحرك).
- التكامل عبر HTTP فقط — المحرك يستهلك JSON، لا يعرف Whisper.
- نموذج small افتراضاً؛ حجم القرص ~244 MB.
- **معطّلة افتراضياً في CI.** التشغيل يدوي في التطوير عند الحاجة.

**العقد:**
    POST /transcribe
      multipart/form-data:
        file: audio (wav/mp3/m4a/webm — أيّ ما يقرأه ffmpeg/PyAV)
        language: 'ar' (افتراضي — نمرّره صراحةً لتحسين الأداء)
        model_size: 'small' | 'base' | 'medium' (افتراضي 'small')
      → 200 { text, language, duration, segments: [{start, end, text}] }
"""
from __future__ import annotations

import io
import os
import tempfile
import time
from typing import Any

from fastapi import FastAPI, File, Form, HTTPException, UploadFile

app = FastAPI(title="pf-mediakit transcriber", version="0.1.0")

# نموذج مُحمَّل كسولاً وذاكرة مؤقّتة عبر الطلبات (نفس النموذج مُشترَك).
_MODEL_CACHE: dict[str, Any] = {}


def _get_model(size: str):
    """يحمّل النموذج مرة واحدة، ثم يعيد المُخزَّن."""
    if size not in _MODEL_CACHE:
        from faster_whisper import WhisperModel

        # CPU int8 — أنسب على Mac بلا CUDA. الاختيار: سرعة معقولة + دقّة
        # قريبة من fp16 بدون بطاقة رسومية.
        _MODEL_CACHE[size] = WhisperModel(
            size, device="cpu", compute_type="int8"
        )
    return _MODEL_CACHE[size]


@app.get("/health")
def health() -> dict[str, Any]:
    """فحص جاهزية بلا تحميل النموذج."""
    return {
        "status": "ok",
        "service": "transcriber",
        "loaded_models": list(_MODEL_CACHE.keys()),
    }


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    language: str = Form("ar"),
    model_size: str = Form("small"),
    initial_prompt: str = Form(""),
) -> dict[str, Any]:
    """يفرّغ ملف الصوت المُرفَق. يُعيد النصّ الكامل + مقاطع + كلمات موقّتة.

    `initial_prompt`: نصّ يُمرَّر لـWhisper كسياق مسبَق — الآلية القياسية
    للقاموس المخصّص للأسماء الإخبارية. مثال: «أردوغان، غزة، الأناضول،
    دير الزور» — يوجّه النموذج لتفضيل هذه الكتابات على التصحيح الفونيمي.
    الطول الأقصى: 224 توكن (قيد Whisper).
    """
    if model_size not in {"tiny", "base", "small", "medium", "large-v3"}:
        raise HTTPException(status_code=400, detail=f"model_size غير مدعوم: {model_size}")

    # نحفظ المرفَق في ملف مؤقّت — faster-whisper يقرأ من مسار أو np.array.
    # المسار أبسط ويستهلك تدفّق ffmpeg الداخلي (PyAV) لأيّ format.
    contents = await file.read()
    suffix = os.path.splitext(file.filename or "")[1] or ".wav"
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(contents)
        tmp_path = tmp.name

    try:
        model = _get_model(model_size)
        t0 = time.time()
        segments_iter, info = model.transcribe(
            tmp_path,
            language=language,
            beam_size=5,
            vad_filter=False,
            word_timestamps=True,  # تزمين على مستوى الكلمة — للترجمة/الكاراوكي
            initial_prompt=initial_prompt or None,
        )
        segments = []
        for s in segments_iter:
            words = []
            for w in (s.words or []):
                words.append({
                    "start": round(w.start, 3),
                    "end": round(w.end, 3),
                    "text": w.word.strip(),
                    "probability": round(w.probability, 3),
                })
            segments.append({
                "start": round(s.start, 3),
                "end": round(s.end, 3),
                "text": s.text.strip(),
                "words": words,
            })
        text = " ".join(s["text"] for s in segments).strip()
        elapsed = time.time() - t0
    finally:
        os.unlink(tmp_path)

    return {
        "text": text,
        "language": info.language,
        "language_probability": round(info.language_probability, 3),
        "duration": round(info.duration, 3),
        "processing_time": round(elapsed, 3),
        "model_size": model_size,
        "segments": segments,
    }
