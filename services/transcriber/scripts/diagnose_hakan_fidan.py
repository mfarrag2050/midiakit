"""diagnose_hakan_fidan — لماذا فشل «هاكان فيدان» في المُشغَّلين السابقَين؟

الفرضيات المحتملة:
  (١) الاسم التركي بحروف عربية — النموذج ينطقه بصوتيات مختلفة.
  (٢) طول initial_prompt أدّى إلى إسقاط جزء من القاموس.
  (٣) موضع الاسم في الجملة (بداية vs وسط) يؤثّر.
  (٤) تشابه صوتي مع كلمة عربية شائعة تسحب المخرج.

**المنهج:**
   أ) قاموس أحادي «هاكان فيدان» فقط — إن نجح، الفرضية (٢) صحيحة.
   ب) طباعة ما يقوله النموذج فعلاً في موضع الاسم — يكشف نمط الخطأ.

**لا إصلاح — تشخيص فقط.**
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

TARGET = "هاكان فيدان"


def normalize_ar(text: str) -> str:
    text = "".join(c for c in unicodedata.normalize("NFD", text) if unicodedata.category(c) != "Mn")
    text = text.replace("أ", "ا").replace("إ", "ا").replace("آ", "ا")
    text = text.replace("ى", "ي").replace("ة", "ه")
    text = re.sub(r"[.,؟?!،:;\"'\-–—…()\[\]]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def transcribe(prompt: str) -> tuple[str, float]:
    from faster_whisper import WhisperModel
    model = WhisperModel("small", device="cpu", compute_type="int8")
    t0 = time.time()
    segments, _info = model.transcribe(
        str(AUDIO), language="ar", initial_prompt=prompt, word_timestamps=False,
    )
    text = " ".join(s.text.strip() for s in segments)
    return text, time.time() - t0


def find_target(text: str) -> bool:
    return normalize_ar(TARGET) in normalize_ar(text)


def extract_window(reference: str, hypothesis: str, target: str, window: int = 3) -> tuple[list[str], list[str]]:
    """يجد موضع target في المرجع + يعيد نافذة كلمات حوله من المرجع والفرضية."""
    ref_words = normalize_ar(reference).split()
    hyp_words = normalize_ar(hypothesis).split()
    target_words = normalize_ar(target).split()

    # نبحث عن أوّل ظهور لأول كلمة من target في المرجع
    ref_pos = -1
    for i in range(len(ref_words) - len(target_words) + 1):
        if ref_words[i:i + len(target_words)] == target_words:
            ref_pos = i
            break

    if ref_pos < 0:
        return [], []

    # نافذة المرجع
    ref_start = max(0, ref_pos - window)
    ref_end = min(len(ref_words), ref_pos + len(target_words) + window)
    ref_window = ref_words[ref_start:ref_end]

    # نافذة تقريبية في الفرضية عبر نسبة الموضع
    ratio = ref_pos / len(ref_words)
    hyp_estimated_pos = int(ratio * len(hyp_words))
    hyp_start = max(0, hyp_estimated_pos - window - len(target_words))
    hyp_end = min(len(hyp_words), hyp_estimated_pos + len(target_words) + window + 2)
    hyp_window = hyp_words[hyp_start:hyp_end]

    return ref_window, hyp_window


def main() -> None:
    reference = REFERENCE.read_text(encoding="utf-8").strip()

    print("═══════ تشخيص «هاكان فيدان» ═══════")
    print(f"  الهدف: {TARGET}")
    print(f"  المرجع يحوي «هاكان فيدان»؟ {find_target(reference)}")
    print()

    experiments = [
        ("خ) قاموس فارغ (baseline)", ""),
        ("ي) قاموس أحادي — «هاكان فيدان» وحده", "هاكان فيدان"),
        ("ك) قاموس مضاعف — «هاكان فيدان» + «أنقرة»", "هاكان فيدان، أنقرة"),
        ("ل) قاموس تركيز — أسماء تركية فقط", "هاكان فيدان، رجب طيب أردوغان، أنقرة، إسطنبول"),
        ("م) القاموس الكامل السابق (7 مصطلحات)", "هاكان فيدان، دير الزور، كونيكو، مجلس الأمن، وكالة الأناضول، أنقرة، سوريا"),
    ]

    results = {}
    for label, prompt in experiments:
        print(f"═══════ {label} ═══════")
        if prompt:
            print(f"  initial_prompt ({len(prompt)} حرف): «{prompt}»")
        else:
            print(f"  initial_prompt: (فارغ)")
        hyp, elapsed = transcribe(prompt)
        found = find_target(hyp)
        ref_win, hyp_win = extract_window(reference, hyp, TARGET, window=3)

        print(f"  الاسم موجود في الفرضية؟ {'✓ نعم' if found else '✗ لا'}")
        print(f"  زمن التفريغ: {elapsed:.1f}s")
        if not found and ref_win:
            print(f"  المرجع (نافذة ±3 كلمات): «{' '.join(ref_win)}»")
            print(f"  الفرضية (نفس النافذة تقريباً):  «{' '.join(hyp_win)}»")
            # نحاول تحديد الكلمات المرشّحة كبديل «هاكان» و «فيدان»
            print(f"  → البحث عن أنماط مشابهة صوتياً…")
            candidates = []
            for word in hyp_win:
                # أنماط ه/ح + ك/ق
                if re.match(r"^[هحاكق][اك][نم]?", word) and len(word) >= 3:
                    candidates.append((word, "قد يكون بديل «هاكان»"))
                # أنماط ف/ب + ي/د
                if re.match(r"^[فبڤ][يياد][دن]", word) and len(word) >= 3:
                    candidates.append((word, "قد يكون بديل «فيدان»"))
            if candidates:
                for w, why in candidates:
                    print(f"    • «{w}»  ({why})")
            else:
                print(f"    (لا مرشّح صريح — قد يكون النموذج ضغط أو حذف)")
        print()

        results[label] = {
            "prompt_length": len(prompt),
            "hypothesis": hyp,
            "found": found,
            "elapsed_sec": elapsed,
            "ref_window": ref_win,
            "hyp_window": hyp_win,
        }

    # جدول ملخّص
    print("═══════ ملخّص التجارب ═══════")
    print(f"{'التجربة':<45} {'طول':>6} {'وجد؟':>8}")
    for label, r in results.items():
        mark = "✓" if r["found"] else "✗"
        print(f"{label:<45} {r['prompt_length']:>6} {mark:>8}")

    print()
    print("═══════ الاستنتاج (بالتشخيص لا الإصلاح) ═══════")
    single_ok = results["ي) قاموس أحادي — «هاكان فيدان» وحده"]["found"]
    dual_ok = results["ك) قاموس مضاعف — «هاكان فيدان» + «أنقرة»"]["found"]
    focus_ok = results["ل) قاموس تركيز — أسماء تركية فقط"]["found"]
    full_ok = results["م) القاموس الكامل السابق (7 مصطلحات)"]["found"]
    if single_ok and not full_ok:
        print("  ✓ الفرضية (٢) صحيحة: طول القاموس يُسقط الاسم — يستحق قيداً معلَناً.")
    elif single_ok and full_ok:
        print("  ✗ الفرضية (٢) خاطئة: القاموس الكامل نفعه هنا — التشغيل الأصلي ربّما بيئي.")
    elif not single_ok:
        print("  ✗ الفرضية (٢) لا تُفسّر — القاموس بمفرده لا يكفي.")
        print("  → الفرضية (١) أو (٤) مرشّحة: النموذج له صعوبة صوتية مع الاسم.")

    out = REPO / "services/transcriber/out/diagnose_hakan_fidan.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\n  ✓ التفاصيل الكاملة في {out.relative_to(REPO)}")


if __name__ == "__main__":
    main()
