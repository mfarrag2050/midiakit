"""FastAPI endpoint لخدمة كشف الوجوه.

يعمل CPU-only (MTCNN لا يحتاج GPU). يُشغَّل مرة واحدة عند رفع كل صورة
جديدة، ثم تُخزَّن الإحداثيات مع الأصل ولا تُعاد الحوسبة عند الرندر (L-07).

المخرج JSON بالصيغة التي يستهلكها `packages/engine/src/layers/smart-crop.ts`:

  { "width": int, "height": int, "faces": [ { "x": int, "y": int,
                                               "w": int, "h": int,
                                               "score": float } ] }

كل إحداثي بالبكسل من زاوية الصورة العليا اليسرى (نمط SVG/Canvas).
"""

from __future__ import annotations

import io
import os
import time
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import JSONResponse

# lazy-load — MTCNN يستدعي TensorFlow؛ نُؤجّل الاستيراد لتسريع /health.
_detector: Any = None


def _get_detector() -> Any:
    """يبني/يعيد detector مشترك (thread-safe عبر GIL في السيناريو الحالي)."""
    global _detector
    if _detector is None:
        from mtcnn import MTCNN  # type: ignore
        _detector = MTCNN()
    return _detector


app = FastAPI(
    title="face-detector-service",
    version="0.1.0",
    description="كشف الوجوه للقصّ الذكي — يعمل CPU-only.",
)


@app.get("/health")
async def health() -> dict[str, Any]:
    """فحص حياة الخدمة بلا تحميل النموذج (زمن ≤ 5 ms)."""
    return {"status": "ok", "service": "face-detector", "model_loaded": _detector is not None}


@app.post("/detect")
async def detect(file: UploadFile = File(...)) -> JSONResponse:
    """يكشف الوجوه في الصورة المرفَقة.

    قيود:
      • JPEG/PNG/WebP (Pillow يقرأ الشائع).
      • حد أعلى موصى به: 4K × 4K — الأكبر يستهلك ذاكرة أعلى.

    إرجاع JSON بصيغة `smart-crop.ts` (width/height/faces[]).
    """
    if not file.content_type or not file.content_type.startswith("image/"):
        raise HTTPException(status_code=400, detail=f"content_type غير مدعوم: {file.content_type}")

    # قراءة الصورة عبر Pillow — لا مسار مؤقّت على القرص.
    try:
        from PIL import Image  # type: ignore
    except ImportError as e:
        raise HTTPException(status_code=500, detail=f"Pillow غير مثبَّت: {e}")

    contents = await file.read()
    try:
        img = Image.open(io.BytesIO(contents)).convert("RGB")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"فشل قراءة الصورة: {e}")

    import numpy as np  # numpy تبعية transitive لـmtcnn
    arr = np.array(img)

    detector = _get_detector()
    t0 = time.time()
    raw = detector.detect_faces(arr)  # قائمة قواميس: {box, confidence, keypoints}
    elapsed_ms = int((time.time() - t0) * 1000)

    # تحويل إلى الصيغة الموحّدة التي يستهلكها المحرك.
    faces = []
    for f in raw:
        box = f.get("box") or []
        if len(box) != 4:
            continue
        x, y, w, h = box
        # MTCNN قد يعيد إحداثيات سالبة على حواف الصورة — نقصّها.
        x = max(0, int(x))
        y = max(0, int(y))
        w = max(0, int(w))
        h = max(0, int(h))
        faces.append({
            "x": x, "y": y, "w": w, "h": h,
            "score": float(f.get("confidence", 0.0)),
        })

    return JSONResponse({
        "width": img.width,
        "height": img.height,
        "faces": faces,
        "elapsed_ms": elapsed_ms,
    })


if __name__ == "__main__":
    # منفذ 19082 — يتبع نطاق pf-mediakit (19000-19099) بعد 19080
    # (diacritizer) و 19081 (transcriber).
    port = int(os.environ.get("FACE_DETECTOR_PORT", "19082"))
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=port)
