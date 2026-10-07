/**
 * services/font-metrics — استخراج متريكات رأس الخطّ (BASELINE-A).
 *
 * **مصدر واحد لمنطق قراءة الخطّ في المستودع كلّه.** يُستدعى من:
 *   • مسار الرفع في apps/api (finalize للـkind=font)
 *   • أداة سطر الأوامر: scripts/measure-font-metrics.mjs (عبر tsx)
 *
 * **لماذا في apps/api لا في packages/shared؟**
 * packages/engine يعتمد على packages/shared → لو دخلها opentype.js لدخلت
 * إلى شجرة تبعيّات المحرك، وانكسرت قاعدة «المحرّك لا يحلّل خطّاً» فعلاً
 * لا صياغةً. مكانها هنا محفوظ للخادم وحده — apps/api لا يعتمد عليه
 * أيّ حزمة أخرى.
 *
 * **قاعدة معلَنة (90-FONT-METRICS-UPLOAD · قرار المالك 2026-09-11):**
 * القياس يجري مرّة واحدة خارج مسار الرسم · لا يعبر إلى المحرّك إلّا أعداد
 * (`FontMetrics = { ascent, descent, unitsPerEm }`).
 *
 * **المصدر (بترتيب الأفضليّة)**:
 *   1. `OS/2.sTypoAscender` / `|OS/2.sTypoDescender|` — معياريّ عبر منصّات
 *   2. `hhea.ascender` / `|hhea.descender|` — احتياطي للخطوط القديمة
 *   3. غياب الاثنَين ⇒ `null` (المستدعي يفسّرها كـ«خطّ غير قابل للقياس»)
 *
 * `unitsPerEm` من `head.unitsPerEm` — عادةً 1000 (TTF) أو 2048 (OpenType).
 * التحويل إلى بكسل: `pixelHeight = (ascent + descent) × fs / unitsPerEm`.
 */
import opentype from 'opentype.js';

/** المتريكات المستخرَجة — تطابق FontMetrics في packages/shared (لا استيراد · نبقيها منفصلة عن shared لعدم كسر مسار التبعيّات). */
export interface ExtractedMetrics {
  readonly ascent: number;
  readonly descent: number;
  readonly unitsPerEm: number;
  /** المصدر — «typo» أو «hhea» — للتشخيص، لا يُخزَّن في BrandKit. */
  readonly source: 'typo' | 'hhea';
}

/**
 * نتيجة محاولة قراءة الخطّ — تفرّق بين:
 *   • parse_fail  — الملفّ غير مقروء (ليس TTF/OTF/WOFF2 صالحاً) ⇒ عميلٌ يرى INVALID_FONT_FILE.
 *   • missing    — قُرئ لكنّه بلا OS/2/hhea/head ⇒ INVALID_FONT_METRICS.
 *   • ok         — المتريكات متاحة.
 */
export type FontReadResult =
  | { readonly ok: true; readonly metrics: ExtractedMetrics }
  | { readonly ok: false; readonly reason: 'parse_fail' | 'missing' };

/**
 * يستخرج المتريكات من buffer خام (ttf/otf/woff/woff2). يعيد `null` للتوافق
 * مع المستدعين القدامى (CLI measure-font). للمسار الجديد (finalize) استعمل
 * `readFont(buf)` الذي يفرّق بين parse_fail و missing.
 */
export function extractFontMetrics(buf: Buffer): ExtractedMetrics | null {
  const r = readFont(buf);
  return r.ok ? r.metrics : null;
}

/** قراءة الخطّ مع التمييز بين سبب الفشل. المصدر الحقيقيّ للمنطق. */
export function readFont(buf: Buffer): FontReadResult {
  let font: opentype.Font;
  try {
    // opentype.parse يقبل ArrayBuffer فقط — نبني view دقيق من buffer
    font = opentype.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  } catch {
    return { ok: false, reason: 'parse_fail' };
  }

  const os2 = font.tables['os2'] as { sTypoAscender?: number; sTypoDescender?: number } | undefined;
  const hhea = font.tables['hhea'] as { ascender?: number; descender?: number } | undefined;
  const head = font.tables['head'] as { unitsPerEm?: number } | undefined;

  if (!head || typeof head.unitsPerEm !== 'number') return { ok: false, reason: 'missing' };

  let ascent: number;
  let descent: number;
  let source: 'typo' | 'hhea';

  if (os2 && typeof os2.sTypoAscender === 'number' && typeof os2.sTypoDescender === 'number') {
    ascent = os2.sTypoAscender;
    descent = Math.abs(os2.sTypoDescender);
    source = 'typo';
  } else if (hhea && typeof hhea.ascender === 'number' && typeof hhea.descender === 'number') {
    ascent = hhea.ascender;
    descent = Math.abs(hhea.descender);
    source = 'hhea';
  } else {
    return { ok: false, reason: 'missing' };
  }

  if (!Number.isFinite(ascent) || !Number.isFinite(descent) || !Number.isFinite(head.unitsPerEm)) {
    return { ok: false, reason: 'missing' };
  }
  if (head.unitsPerEm <= 0 || ascent <= 0 || descent < 0) {
    return { ok: false, reason: 'missing' };
  }

  return { ok: true, metrics: { ascent, descent, unitsPerEm: head.unitsPerEm, source } };
}
