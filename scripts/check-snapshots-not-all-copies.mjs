#!/usr/bin/env node
// scripts/check-snapshots-not-all-copies.mjs — حارسٌ يمنع عودة فخّ النسخ.
//
// **الخلفيّة (411ب):** بين 2026-09-02 (4ca3242) و 2026-09-15، كانت
// `snapshots-semantic/` نسخةً بايت-بايت من `snapshots/` عبر كلّ 12
// ملفّاً. `verify:snapshot` يقارن بايت-بايت — لكنّه يقارن الحاضر
// بمرجعٍ منسوخٍ فيُعطي إشارةً كاذبة. حارسٌ لا يُعاد إنتاجُه ليس حارساً.
//
// **الحكم الحاسم:** ليست كلُّ فروق snapshots-semantic ↔ snapshots علامةَ
// صحّة — بعض المحتوى (client-demo · card_kicker · reel) لا يُشغِّل
// كواسر دلاليّة، فيتطابق مخرجُهُ في الوضعَين. لكنّ **صفر فارق مطلقاً
// = فخّ**. المحتوى المرجعيّ يحمل HEADLINE_LONG (default · plain)
// المصمَّم صراحةً لتشغيل الكسر الدلاليّ.
//
// **المعيار:** يجب أن يختلف ملفّ **واحدٌ على الأقلّ** بين المرجعَين.
// إن اختلف صفرٌ ⇒ فخّ النسخ عاد · نُفشل بصوت.
//
// **الوصل بـpnpm test:** غير موصولٍ الآن — الوصل بعد إعادة توليد
// المرجع فعلياً (411ب · اقتراح للمالك).

import { readFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const md5 = (b) => createHash('md5').update(b).digest('hex');

const A = join(ROOT, 'snapshots');
const B = join(ROOT, 'snapshots-semantic');

if (!existsSync(A) || !existsSync(B)) {
  console.error(`[check:snapshots-not-all-copies] ${!existsSync(A) ? A : B} غير موجود.`);
  process.exit(1);
}

const files = (await readdir(A))
  .filter((f) => f.endsWith('.png') && !f.endsWith('-nokashida.png'))
  .sort();

let same = 0;
let differ = 0;
let missing = 0;
const identical = [];
for (const f of files) {
  const pa = join(A, f);
  const pb = join(B, f);
  if (!existsSync(pb)) {
    missing++;
    continue;
  }
  const [ba, bb] = await Promise.all([readFile(pa), readFile(pb)]);
  if (md5(ba) === md5(bb)) {
    same++;
    identical.push(f);
  } else {
    differ++;
  }
}

console.log(`[check:snapshots-not-all-copies] snapshots/ = ${files.length} · snapshots-semantic/ = ${same} متطابقة · ${differ} مختلفة · ${missing} مفقودة`);

if (files.length > 0 && differ === 0) {
  console.error('');
  console.error(`✗ فخّ النسخ · جميع الملفّات (${same}/${files.length}) في snapshots-semantic/ نسخةٌ بايت-بايت من snapshots/.`);
  console.error(`  ⇒ الدليل: --semantic=on لم ينتج بايتاً واحداً مختلفاً.`);
  console.error(`  ⇒ الحلّ: ./bin/mk-ci --regen-refs (يستدعي preview.mjs مباشرةً · لا cp بين المرجعَين).`);
  process.exit(1);
}

console.log(`  ✓ ${differ}/${files.length} ملفّاً يُثبت أنّ --semantic=on فَعَل شيئاً.`);
