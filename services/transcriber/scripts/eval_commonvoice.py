"""eval_commonvoice.py — قياس WER على عيّنة من Mozilla Common Voice Arabic.

**قواعد القياس (L-34 · L-36 · L-41):**
- المصدر: `fsicoli/common_voice_19_0` على HuggingFace، config=`ar`، CC0-1.0.
- العيّنة: 15 صوتاً بتنويع أوتوماتيكي عبر seed. الوسيط لا المتوسط.
- المعالجة: تطبيع بسيط (إزالة تشكيل، توحيد مسافات) على الصوت والمرجع
  قبل حساب WER — لا نُعاقب الميزة على قرارات تشكيل غير ذات صلة بالدقة الصوتية.
- الرقم المُبلَّغ: «وسيط WER على 15 عيّنة CV19-ar (CC0، 2026-YY-MM)»،
  لا «دقة تفريغ عربي».

**الاستخدام:**
    source .venv/bin/activate
    python scripts/eval_commonvoice.py --samples 15 --model small
"""
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import tempfile
import time
from pathlib import Path

import soundfile as sf
from datasets import load_dataset
from jiwer import wer

# ── تطبيع نصّ عربي بسيط للمقارنة ──────────────────
# نُزيل التشكيل (Harakat) والتطويل (kashida) — لا نقيسهما هنا. نُزيل
# العلامات غير الأبجدية الرقمية ونوحّد المسافات. هذا معيار WER قياسي
# على العربية (نفس أسلوب أوراق Whisper Multilingual).
_ARABIC_DIACRITICS = re.compile(r"[ً-ْٰـ]")
_NON_ALNUM_AR = re.compile(r"[^ء-ي٠-٩0-9a-zA-Z\s]")
_MULTI_WS = re.compile(r"\s+")


def normalize_ar(s: str) -> str:
    s = _ARABIC_DIACRITICS.sub("", s)
    s = _NON_ALNUM_AR.sub(" ", s)
    s = _MULTI_WS.sub(" ", s).strip()
    return s


def transcribe_file(audio_path: str, model) -> str:
    segments_iter, _ = model.transcribe(
        audio_path, language="ar", beam_size=5, vad_filter=False
    )
    return " ".join(s.text.strip() for s in segments_iter).strip()


def main() -> None:
    p = argparse.ArgumentParser()
    p.add_argument("--samples", type=int, default=15)
    p.add_argument("--model", default="small",
                   choices=["tiny", "base", "small", "medium"])
    p.add_argument("--seed", type=int, default=42)
    p.add_argument("--out", default="out/eval-cv-arabic.json")
    args = p.parse_args()

    # النسخة الرسمية mozilla-foundation مسوَّرة (تحتاج HF token + قبول شروط).
    # نستعمل نسخة مجتمعية علنية: MohamedRashad/common-voice-18-arabic
    # (متاح بلا مصادقة، البيانات نفسها CC0-1.0 من Mozilla).
    dataset_id = "MohamedRashad/common-voice-18-arabic"
    print(f"[eval] loading dataset {dataset_id} (streaming) ...")
    ds = load_dataset(dataset_id, split="test", streaming=True)

    # نجمع عدداً أكبر بقليل ثم نصفّي حسب المدة (نتفادى القصيرة جداً).
    collected: list[dict] = []
    fetched = 0
    skip = args.seed * 3  # تنويع بسيط عبر seed
    for row in ds:
        fetched += 1
        if fetched <= skip:
            continue
        audio = row.get("audio")
        sentence = row.get("sentence")
        if not audio or not sentence:
            continue
        # المدة: عدد العيّنات / sample_rate
        sr = audio.get("sampling_rate", 0)
        arr = audio.get("array")
        if arr is None or sr == 0:
            continue
        duration = len(arr) / sr
        if duration < 2.0 or duration > 20.0:
            continue  # نستبعد القصيرة والطويلة جداً
        collected.append({
            "sentence": sentence,
            "audio_array": arr,
            "sampling_rate": sr,
            "duration": duration,
            "client_id": row.get("client_id", ""),
        })
        if len(collected) >= args.samples:
            break

    if len(collected) < args.samples:
        print(f"[eval] ⚠️ التقطنا {len(collected)} فقط من {args.samples} المطلوبة")

    print(f"[eval] collected {len(collected)} samples")
    print(f"[eval] loading faster-whisper model={args.model} device=cpu int8 ...")
    from faster_whisper import WhisperModel

    t_load = time.time()
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    print(f"[eval] model loaded in {time.time() - t_load:.1f}s")

    results = []
    with tempfile.TemporaryDirectory() as td:
        for i, sample in enumerate(collected, 1):
            wav_path = os.path.join(td, f"s{i}.wav")
            sf.write(wav_path, sample["audio_array"], sample["sampling_rate"])
            ref = sample["sentence"]
            ref_norm = normalize_ar(ref)
            t0 = time.time()
            hyp = transcribe_file(wav_path, model)
            elapsed = time.time() - t0
            hyp_norm = normalize_ar(hyp)
            try:
                sample_wer = wer(ref_norm, hyp_norm)
            except Exception as e:
                sample_wer = 1.0
                print(f"[eval] sample {i} wer error: {e}")
            results.append({
                "i": i,
                "duration_s": round(sample["duration"], 2),
                "wer": round(sample_wer, 4),
                "processing_s": round(elapsed, 2),
                "ref": ref,
                "ref_norm": ref_norm,
                "hyp": hyp,
                "hyp_norm": hyp_norm,
            })
            print(f"  [{i:2d}/{len(collected)}] dur={sample['duration']:.1f}s  wer={sample_wer:.3f}  proc={elapsed:.1f}s")

    wers = [r["wer"] for r in results]
    median_wer = statistics.median(wers)
    mean_wer = statistics.mean(wers)
    p95_wer = statistics.quantiles(wers, n=20)[18] if len(wers) >= 20 else max(wers)

    summary = {
        "date": time.strftime("%Y-%m-%d"),
        "dataset": f"{dataset_id} (test split)",
        "license": "CC0-1.0 (Mozilla Common Voice data)",
        "model": args.model,
        "device": "cpu",
        "compute_type": "int8",
        "samples": len(results),
        "duration_range_s": [
            min(r["duration_s"] for r in results),
            max(r["duration_s"] for r in results),
        ],
        "wer_median": round(median_wer, 4),
        "wer_mean": round(mean_wer, 4),
        "wer_p95": round(p95_wer, 4),
        "wer_min": round(min(wers), 4),
        "wer_max": round(max(wers), 4),
        "processing_time_median_s": round(statistics.median(r["processing_s"] for r in results), 2),
    }

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with out_path.open("w", encoding="utf-8") as f:
        json.dump({"summary": summary, "results": results}, f, ensure_ascii=False, indent=2)

    print()
    print(f"════════ خلاصة قياس WER — Common Voice Arabic ════════")
    for k, v in summary.items():
        print(f"  {k}: {v}")
    print(f"[eval] تفاصيل محفوظة في {out_path}")


if __name__ == "__main__":
    main()
