"""test_word_timing.py — فحص التزمين على مستوى الكلمة على عيّنة واحدة.

يُظهر:
- إجمالي كلمات الفريغ
- بداية/نهاية كل كلمة
- تحقّق: هل كل كلمة بين 0 ومدة الصوت؟
- هل الكلمات مرتّبة تصاعدياً؟
- عرض في شكل «كاراوكي» مبسّط لبطاقة واحدة

**البوابة الوظيفية:** التزمين يعمل إن (١) كل كلمة لها start<end،
(٢) الكلمات مرتّبة، (٣) الأزمنة داخل [0, duration].
"""
from __future__ import annotations

import os
import tempfile
import time

import soundfile as sf
from datasets import load_dataset

DATASET_ID = "MohamedRashad/common-voice-18-arabic"


def main() -> None:
    print(f"[test] loading {DATASET_ID} (test, streaming) ...")
    ds = load_dataset(DATASET_ID, split="test", streaming=True)

    # نأخذ أطول عيّنة نجدها ضمن أول 30 (نتفادى المقاطع الأحادية).
    best = None
    for i, row in enumerate(ds):
        if i >= 30:
            break
        arr = row["audio"]["array"]
        sr = row["audio"]["sampling_rate"]
        dur = len(arr) / sr
        if 5.0 < dur < 15.0:
            if best is None or dur > best["duration"]:
                best = {"array": arr, "sr": sr, "duration": dur,
                        "sentence": row["sentence"]}
    if not best:
        print("[test] ⚠️ لم نجد عيّنة > 5 ثوانٍ في أول 30 — نستعمل ما هو متاح")
        for row in ds:
            arr = row["audio"]["array"]
            sr = row["audio"]["sampling_rate"]
            best = {"array": arr, "sr": sr, "duration": len(arr) / sr,
                    "sentence": row["sentence"]}
            break

    print(f"[test] عيّنة: {best['duration']:.1f}s")
    print(f"[test] المرجع: {best['sentence']}")

    with tempfile.TemporaryDirectory() as td:
        wav_path = os.path.join(td, "sample.wav")
        sf.write(wav_path, best["array"], best["sr"])

        from faster_whisper import WhisperModel
        print("[test] loading model small ...")
        t0 = time.time()
        model = WhisperModel("small", device="cpu", compute_type="int8")
        print(f"[test] loaded in {time.time() - t0:.1f}s")

        t0 = time.time()
        segments_iter, info = model.transcribe(
            wav_path, language="ar", beam_size=5,
            word_timestamps=True, vad_filter=False,
        )
        segments = list(segments_iter)
        elapsed = time.time() - t0

    # ── فحص التزمين ──────────────────────
    all_words = []
    for s in segments:
        for w in (s.words or []):
            all_words.append((w.start, w.end, w.word, w.probability))

    print(f"\n[test] عدد المقاطع: {len(segments)} · عدد الكلمات: {len(all_words)}")
    print(f"[test] وقت المعالجة: {elapsed:.2f}s على صوت {best['duration']:.1f}s")
    print(f"[test] السرعة: {best['duration']/elapsed:.2f}× realtime")

    print(f"\n[test] الكلمات بالتزمين:")
    for i, (start, end, word, prob) in enumerate(all_words):
        marker = "✓" if start < end and 0 <= start <= best["duration"] else "✗"
        print(f"  {marker} [{start:5.2f} → {end:5.2f}]  {word!r}  p={prob:.2f}")

    # ── البوابة الوظيفية ─────────────────
    print(f"\n[test] البوابة الوظيفية:")
    ordered = all(all_words[i][0] <= all_words[i+1][0] for i in range(len(all_words)-1))
    in_range = all(0 <= s <= best["duration"] and 0 <= e <= best["duration"]
                   for s, e, _, _ in all_words)
    starts_before_ends = all(s < e for s, e, _, _ in all_words)

    print(f"  الكلمات مرتّبة تصاعدياً: {'✓' if ordered else '✗'}")
    print(f"  كل كلمة داخل [0, {best['duration']:.1f}]s: {'✓' if in_range else '✗'}")
    print(f"  start<end لكل كلمة: {'✓' if starts_before_ends else '✗'}")

    if ordered and in_range and starts_before_ends:
        print("\n[test] ✓ التزمين على مستوى الكلمة يعمل")
    else:
        print("\n[test] ✗ خلل في التزمين — راجع أعلاه")


if __name__ == "__main__":
    main()
