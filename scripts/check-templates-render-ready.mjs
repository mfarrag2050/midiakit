#!/usr/bin/env node
/**
 * 109-CARD-DECISION — بوّابة عقد الرندر (منقّحة بحسب العقد الحقيقيّ).
 *
 * تاريخ سابق (241): كانت البوّابة تشترط حقلَي `card` و `video` على المستوى
 * الأعلى بناءً على تعليقٍ خاطئ في `api-worker.ts` («renderFrame يستعمل
 * template.card»). القياس (108) أثبت أنّ `Template` **لا يحمل `card`** —
 * انظر `packages/templates/src/types.ts:291-303` و `render.ts:1152`
 * (`for (const layer of args.template.layers)`).
 *
 * القرار (109 · خيار ب): البوّابة تُطابق العقد لا الخيال.
 *
 * الشرط الحقيقيّ لكلّ قالب:
 *   (١) `layers` مصفوفة غير فارغة — schema يشترطها لكن نُبقيها كدفاع.
 *   (٢) `kind` ∈ {'static','video'} — قيمة صحيحة من العقد.
 *
 * ما لا تكشفه (بحقّ):
 *   • غياب `card` — العقد لا يعرف هذا الحقل، اشتراطُه اختراعُ بيانات.
 *   • علاقة kind ↔ video — العقد يجعل `video?` اختياريّاً. كون قالبٍ
 *     kind='video' بلا video block **قد** يكشف حاجة منتج، لكنّه ليس
 *     خطأ عقد. الفشل الحقيقيّ يقع عند التصدير الحيّ (MP4_UNSUPPORTED_TEMPLATE)،
 *     وهناك الحارس في api-worker.ts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const TEMPLATES_DIR = join(ROOT, 'packages/templates/src/templates');

const files = readdirSync(TEMPLATES_DIR).filter(f => f.endsWith('.json')).sort();
const errors = [];

for (const file of files) {
  const obj = JSON.parse(readFileSync(join(TEMPLATES_DIR, file), 'utf-8'));

  // (١) layers مصفوفة غير فارغة
  if (!Array.isArray(obj.layers) || obj.layers.length === 0) {
    errors.push(
      `  ✗ ${file}: \`layers\` فارغة أو غائبة.\n` +
      `      renderFrame يقرأ template.layers مباشرة (render.ts:1152). قالبٌ بلا layers لن يرسم شيئاً.`
    );
  }

  // (٢) kind قيمة صحيحة
  if (obj.kind !== 'static' && obj.kind !== 'video') {
    errors.push(
      `  ✗ ${file}: \`kind\` = "${obj.kind}" (يجب 'static' أو 'video').\n` +
      `      kind هو تصريح الصانع عن نوع القالب — من العقد (types.ts:251).`
    );
  }
}

if (errors.length > 0) {
  console.error(`[check-templates-render-ready] ✗ ${errors.length} انحراف عقد:`);
  for (const e of errors) console.error(e);
  console.error(
    `\n  مرجع العقد: packages/templates/src/types.ts:291-303 (Template + TemplateVideo).\n` +
    `  التحقّق الحيّ من الحارس: apps/renderer/src/api-worker.ts:275-295.`
  );
  process.exit(1);
}

console.log(`[check-templates-render-ready] ✓ ${files.length} قوالب مطابقة للعقد (layers غير فارغة · kind صحيح).`);
