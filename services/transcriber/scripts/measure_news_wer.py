"""measure_news_wer — يقيس WER على fixtures/audio/news-sample-16k.wav.

يُشغَّل من داخل services/transcriber/.venv:
    source services/transcriber/.venv/bin/activate
    python services/transcriber/scripts/measure_news_wer.py

يُنتج قياسين:
    (أ) بلا قاموس مخصّص (baseline)
    (ب) مع initial_prompt يحوي الأسماء المستهدفة

ثمّ لكل واحد:
    - WER عام (jiwer)
    - دقة الأسماء الأربعة (بحث نصّي على المخرج)

**لا تعميم:** الرقم من عيّنة واحدة (تسجيل واحد · صوت واحد · فصحى إعلامية).
يُنقل إلى M1 كـرقم-من-عيّنة-واحدة صراحةً.
"""

from __future__ import annotations

import json
import re
import sys
import time
import unicodedata
from pathlib import Path

REPO = Path(__file__).resolve().parents[3]
AUDIO = REPO / "fixtures/audio/news-sample-16k.wav"
REFERENCE = REPO / "fixtures/audio/news-sample.txt"

TARGET_NAMES = [
    "هاكان فيدان",
    "دير الزور",
    "كونيكو",
    "مجلس الأمن",
]

# القاموس المخصّص — يُمرَّر كـinitial_prompt.
# نضيف أسماء أخرى قد ترد في المقطع (خاصّة «الأناضول» — سبب اختبار docs في README).
DICTIONARY = "هاكان فيدان، دير الزور، كونيكو، مجلس الأمن، وكالة الأناضول، أنقرة، سوريا"


def normalize_ar(text: str) -> str:
    """تطبيع للمقارنة: يحذف التشكيل + المسافات المتعدّدة + علامات ترقيم أساسية.
    يُبقي الحروف والأرقام والمسافات المفردة."""
    # حذف كل combining marks (تشكيل)
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    # توحيد الألف
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    # توحيد الياء والألف المقصورة
    text = text.replace("ى", "ي").replace("ة", "ه")
    # حذف علامات الترقيم
    text = re.sub(r"[.,؟?!،:;\"'\-–—…()\[\]]", " ", text)
    # مسافات متعدّدة → واحدة
    text = re.sub(r"\s+", " ", text).strip()
    return text


def wer(reference: str, hypothesis: str) -> tuple[float, int, int]:
    """WER يدوي: مسافة Levenshtein على الكلمات ÷ عدد كلمات المرجع.
    نعيد (نسبة، عدد الأخطاء، عدد كلمات المرجع)."""
    ref = normalize_ar(reference).split()
    hyp = normalize_ar(hypothesis).split()
    n, m = len(ref), len(hyp)
    if n == 0:
        return (float("inf") if m > 0 else 0.0, m, 0)
    # DP Levenshtein على مستوى الكلمة
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            cost = 0 if ref[i - 1] == hyp[j - 1] else 1
            d[i][j] = min(
                d[i - 1][j] + 1,          # حذف
                d[i][j - 1] + 1,          # إدراج
                d[i - 1][j - 1] + cost,   # استبدال
            )
    errors = d[n][m]
    return (errors / n, errors, n)


def count_names_in(text: str, names: list[str]) -> dict[str, bool]:
    """يبحث كل اسم في النصّ بعد التطبيع. يعيد mapping name → bool."""
    normalized_text = normalize_ar(text)
    out = {}
    for name in names:
        normalized_name = normalize_ar(name)
        out[name] = normalized_name in normalized_text
    return out


def transcribe(audio_path: Path, initial_prompt: str = "") -> tuple[str, float]:
    """يفرّغ الملف عبر faster-whisper. يعيد (النصّ، الزمن بالثواني)."""
    from faster_whisper import WhisperModel

    model = WhisperModel("small", device="cpu", compute_type="int8")
    t0 = time.time()
    segments, info = model.transcribe(
        str(audio_path),
        language="ar",
        initial_prompt=initial_prompt,
        word_timestamps=False,
    )
    text = " ".join(s.text.strip() for s in segments)
    elapsed = time.time() - t0
    return text, elapsed


def main() -> None:
    if not AUDIO.exists():
        print(f"✗ الملف غير موجود: {AUDIO}", file=sys.stderr)
        sys.exit(1)
    if not REFERENCE.exists():
        print(f"✗ النصّ المرجعي غير موجود: {REFERENCE}", file=sys.stderr)
        sys.exit(1)

    reference = REFERENCE.read_text(encoding="utf-8").strip()

    print("═══════ إعداد ═══════")
    print(f"  الصوت:      {AUDIO.relative_to(REPO)} ({AUDIO.stat().st_size / 1024:.0f} KB)")
    print(f"  المرجع:     {REFERENCE.relative_to(REPO)}")
    print(f"  كلمات مرجع: {len(reference.split())}")
    print(f"  النموذج:    faster-whisper small · int8 · CPU")
    print(f"  الأسماء:    {' · '.join(TARGET_NAMES)}")
    print()

    results = {}

    for run_label, prompt in [("(أ) بلا قاموس", ""), ("(ب) مع القاموس", DICTIONARY)]:
        print(f"═══════ {run_label} ═══════")
        if prompt:
            print(f"  initial_prompt: «{prompt}»")
        hypothesis, elapsed = transcribe(AUDIO, prompt)
        rate = elapsed / 42.9  # النسبة إلى مدة الصوت (0.26:1 يعني 3.8× realtime)
        wer_rate, errors, ref_words = wer(reference, hypothesis)
        names_found = count_names_in(hypothesis, TARGET_NAMES)
        names_hit = sum(1 for v in names_found.values() if v)

        print(f"  زمن التفريغ:   {elapsed:.1f}s (نسبة {rate:.2f}:1 من الصوت)")
        print(f"  كلمات المخرج:  {len(hypothesis.split())}")
        print(f"  WER العام:     {wer_rate:.3f} ({errors} خطأ من {ref_words} كلمة)")
        print(f"  دقة الأسماء:   {names_hit}/{len(TARGET_NAMES)}")
        for name, hit in names_found.items():
            print(f"    {'✓' if hit else '✗'} {name}")
        print()

        results[run_label] = {
            "elapsed_sec": elapsed,
            "wer": wer_rate,
            "errors": errors,
            "ref_words": ref_words,
            "names_hit": names_hit,
            "names_total": len(TARGET_NAMES),
            "names_detail": names_found,
            "hypothesis": hypothesis,
        }

    # الملخّص
    print("═══════ ملخّص الفرق ═══════")
    a = results["(أ) بلا قاموس"]
    b = results["(ب) مع القاموس"]
    print(f"  WER: {a['wer']:.3f} ← {b['wer']:.3f}  (Δ = {(b['wer'] - a['wer']):+.3f})")
    print(f"  أسماء: {a['names_hit']}/{a['names_total']} ← {b['names_hit']}/{b['names_total']}")

    # نحفظ المخرج للتوثيق
    out_json = REPO / "services/transcriber/out/news_wer.json"
    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  ✓ التفاصيل في {out_json.relative_to(REPO)}")


if __name__ == "__main__":
    main()
