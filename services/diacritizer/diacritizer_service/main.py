"""خدمة تشكيل عربية معزولة.

- POST /diacritize { text } -> { text, source, ms }
- GET  /health -> { status, model }

**قرارات معمارية:**
- **خدمة منفصلة** — لا بايثون داخل packages/engine. المحرك يستهلك النص
  المشكّل كمدخل عادي، لا يعرف من شكّله.
- **نموذج يُحمَّل مرة** عند بدء التشغيل، ليس عند كل طلب.
- **المنفذ 19080** من نطاق pf-mediakit (19000-19099) — يحترم قواعد
  ميني CLAUDE.md.
- **بدون CORS** — الاستدعاء دائماً من daemon محلي (renderer/preview.mjs).
  إن احتاجت الواجهة (studio) استدعاء مباشر، يُضاف CORS بقائمة origins
  صريحة، لا `*`.

**التراجع الصامت (client-side):** المستدعي (preview.mjs/renderer) يعالج
انقطاع الاتصال بتحذير + تمرير النص كما هو. لا فشل صعب.
"""

from __future__ import annotations

import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncIterator

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger("diacritizer")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")

# النموذج يُحمَّل مرة في دورة عمر التطبيق — تفادي إعادة التحميل لكل طلب.
_MODEL_STATE: dict = {"instance": None, "loaded_at": None}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """يحمّل النموذج قبل قبول الطلبات — startup event في FastAPI الحديث."""
    logger.info("تحميل نموذج arabic-diacritizer …")
    t0 = time.perf_counter()
    from diacritize import Diacritizer  # type: ignore

    _MODEL_STATE["instance"] = Diacritizer.from_pretrained()
    _MODEL_STATE["loaded_at"] = time.time()
    logger.info(f"النموذج جاهز خلال {(time.perf_counter() - t0):.2f}s")
    yield
    _MODEL_STATE["instance"] = None


app = FastAPI(
    title="pf-mediakit diacritizer",
    version="0.1.0",
    lifespan=lifespan,
)


class DiacritizeRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=2000)


class DiacritizeResponse(BaseModel):
    text: str
    source: str = "arabic-diacritizer"
    ms: float


@app.get("/health")
def health() -> dict:
    ready = _MODEL_STATE["instance"] is not None
    return {
        "status": "ok" if ready else "loading",
        "model": "arabic-diacritizer",
        "loaded_at": _MODEL_STATE["loaded_at"],
    }


@app.post("/diacritize", response_model=DiacritizeResponse)
def diacritize(req: DiacritizeRequest) -> DiacritizeResponse:
    model = _MODEL_STATE["instance"]
    if model is None:
        raise HTTPException(status_code=503, detail="model-not-ready")
    t0 = time.perf_counter()
    try:
        out = model.diacritize(req.text)
    except Exception as e:  # noqa: BLE001 — نلفّ كل خطأ نموذج بحدود النظام
        logger.exception("diacritize failed")
        raise HTTPException(status_code=500, detail=f"model-error: {e}") from e
    ms = (time.perf_counter() - t0) * 1000
    return DiacritizeResponse(text=out, ms=round(ms, 2))
