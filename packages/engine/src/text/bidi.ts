// BiDi — docs/05-engine-api.md §«النص ثنائي الاتجاه».
// إلزامي قبل أول عرض حي: اسم لاتيني أو رقم وسط عنوان عربي
// يظهر بترتيب مقلوب بدون هذه الطبقة (لأن المحرك يرسم كلمة كلمة
// من اليمين إلى اليسار، فيتلقّى رذاذ اتجاهات معكوساً في المقاطع اللاتينية).
//
// اختيار الدمج: **طبقة قبل parseTokens**، لا داخله.
// المقايضة:
//   • داخل parseTokens: يجبر المفسّر على تصنيف كل حرف حسب سكريبته
//     وربطه بإعداد BrandKit — يخلط الطباعة بالنحو، ويكسر نقاء المفسّر.
//   • طبقة قبل parseTokens (المُختار): دالة `preprocessBidi(text, opts)`
//     تُعيد سلسلة نصية جاهزة للتفسير. parseTokens يبقى مجرّد ماسح للرموز
//     (*عريض*، _تمييز_، \n). كلفتها استدعاء إضافي في السلسلة — لا شيء غيره.

import type { NumeralStyle } from '@pf-mediakit/shared';

export type BidiDir = 'rtl' | 'ltr';

export interface Run {
  readonly text: string;
  readonly dir: BidiDir;
}

// ── تصنيف الحرف حسب Unicode BiDi (مبسّط) ─────────────

const RTL_RANGES: readonly (readonly [number, number])[] = [
  [0x0590, 0x05ff], // العبرية
  [0x0600, 0x06ff], // العربية
  [0x0700, 0x074f], // السريانية
  [0x0750, 0x077f], // العربية التكميلية
  [0x0780, 0x07bf], // الثاناوية
  [0x08a0, 0x08ff], // Arabic Extended-A
  [0xfb50, 0xfdff], // Arabic Presentation Forms-A
  [0xfe70, 0xfeff], // Arabic Presentation Forms-B
];

const LTR_RANGES: readonly (readonly [number, number])[] = [
  [0x0030, 0x0039], // الأرقام اللاتينية 0-9
  [0x0041, 0x005a], // A-Z
  [0x0061, 0x007a], // a-z
  [0x00c0, 0x00ff], // Latin-1 Supplement
  [0x0100, 0x017f], // Latin Extended-A
  [0x0180, 0x024f], // Latin Extended-B
];

const inRange = (
  code: number,
  ranges: readonly (readonly [number, number])[]
): boolean => {
  for (const r of ranges) {
    if (code >= r[0] && code <= r[1]) return true;
  }
  return false;
};

const charDir = (ch: string): BidiDir | 'neutral' => {
  const cp = ch.codePointAt(0);
  if (cp === undefined) return 'neutral';
  if (inRange(cp, RTL_RANGES)) return 'rtl';
  if (inRange(cp, LTR_RANGES)) return 'ltr';
  return 'neutral';
};

// ── splitBidiRuns ────────────────────────────────────

/**
 * يقسّم النص إلى مقاطع متتالية بنفس الاتجاه.
 * المحايدات (فراغ، ترقيم، ملاحن * و _) تُلحق باتجاه المقطع السابق —
 * أو باتجاه أوّل مقطع قوي إن كانت في مقدمة النص.
 * سلسلة فارغة ⇒ []. سلسلة محايدات كلها ⇒ مقطع 'ltr' واحد (اتفاق).
 */
export function splitBidiRuns(text: string): Run[] {
  if (text.length === 0) return [];

  const chars = [...text];
  const dirs = chars.map(charDir);

  // أول اتجاه قوي — لحساب المحايدات المتقدّمة.
  let firstStrong: BidiDir = 'ltr';
  for (const d of dirs) {
    if (d !== 'neutral') {
      firstStrong = d;
      break;
    }
  }

  const runs: Run[] = [];
  let curText = '';
  let curDir: BidiDir | null = null;

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    const d = dirs[i]!;
    const effective: BidiDir = d === 'neutral' ? (curDir ?? firstStrong) : d;

    if (curDir === null) {
      curDir = effective;
      curText = ch;
    } else if (effective === curDir) {
      curText += ch;
    } else {
      runs.push({ text: curText, dir: curDir });
      curDir = effective;
      curText = ch;
    }
  }
  if (curDir !== null) runs.push({ text: curText, dir: curDir });
  return runs;
}

// ── orderRuns ────────────────────────────────────────

/**
 * يُعيد ترتيب المقاطع لعرض صحيح في اتجاه أساس محدَّد.
 *
 * حين base='rtl' والرسم يمشي كلمة كلمة من اليمين إلى اليسار:
 *   • مقطع RTL — يُبقى كما هو (ترتيبه الطبيعي يتطابق مع الرسم RTL).
 *   • مقطع LTR — تُعكس **ترتيب الكلمات** داخله (لا حروف الكلمة).
 *     السبب: عند الرسم من اليمين، الكلمة الأولى في الطلب الرسمي تُوضع
 *     في أقصى اليمين. لكن اللاتيني يُقرأ من اليسار إلى اليمين، فالكلمة
 *     اليمنى بصرياً يجب أن تكون **الأخيرة** في تسلسل القراءة اللاتيني.
 *
 * الفراغات المحيطية تُحفظ في مكانها كي لا تنكمش الحدود بين المقاطع.
 */
export function orderRuns(
  runs: readonly Run[],
  base: BidiDir = 'rtl'
): Run[] {
  if (base === 'ltr') return runs.map((r) => ({ text: r.text, dir: r.dir }));

  return runs.map((r) => {
    if (r.dir === 'rtl') return { text: r.text, dir: r.dir };

    // احفظ الفراغ الأمامي والخلفي — لا تُدمج مع الكلمات.
    const leadMatch = /^\s*/.exec(r.text);
    const trailMatch = /\s*$/.exec(r.text);
    const leading = leadMatch ? leadMatch[0] : '';
    const trailing = trailMatch ? trailMatch[0] : '';
    const inner = r.text.trim();
    if (inner.length === 0) return { text: r.text, dir: r.dir };

    const words = inner.split(/\s+/);
    const reordered = words.reverse().join(' ');
    return { text: leading + reordered + trailing, dir: r.dir };
  });
}

// ── mapNumerals ──────────────────────────────────────

const ARABIC_INDIC_ZERO = 0x0660;
const LATIN_ZERO = 0x0030;

/**
 * يبدّل الأرقام العشرية بين اللاتينية (0-9) والعربية الهندية (٠-٩).
 * كل رقم يقابله grapheme واحد ⇒ لا تغيير في العرض المُقاس.
 */
export function mapNumerals(text: string, style: NumeralStyle): string {
  if (style === 'arabic') {
    return text.replace(/[0-9]/g, (d) =>
      String.fromCodePoint(ARABIC_INDIC_ZERO + (d.codePointAt(0)! - LATIN_ZERO))
    );
  }
  return text.replace(/[٠-٩]/g, (d) =>
    String.fromCodePoint(LATIN_ZERO + (d.codePointAt(0)! - ARABIC_INDIC_ZERO))
  );
}

// ── preprocessBidi ──────────────────────────────────

export interface PreprocessBidiOptions {
  readonly numerals?: NumeralStyle;
  readonly base?: BidiDir;
}

/**
 * السلسلة الكاملة لمعالجة BiDi قبل parseTokens:
 *   1) mapNumerals (اختياري)
 *   2) splitBidiRuns
 *   3) orderRuns بحسب base
 *   4) دمج المقاطع في سلسلة واحدة
 *
 * المخرج يُغذّى إلى parseTokens.
 */
export function preprocessBidi(
  text: string,
  opts: PreprocessBidiOptions = {}
): string {
  const numeraled = opts.numerals ? mapNumerals(text, opts.numerals) : text;
  const runs = splitBidiRuns(numeraled);
  const ordered = orderRuns(runs, opts.base ?? 'rtl');
  return ordered.map((r) => r.text).join('');
}
