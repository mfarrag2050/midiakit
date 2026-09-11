// /dev/pixel-eq/sample/[name] — أداة قياس مؤقّتة (PIXEL-EQ-M).
// يُعيد {template, brand, content, size} للعيّنة المطلوبة.
// **العيّنة والمحتوى مطابقان لـscripts/preview.mjs حرفياً** — لا اختراع.
//
// ليست ميزة إنتاج. للحذف بعد اكتمال القياس.

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const ROOT = join(process.cwd(), '..', '..');

// نفس ثوابت scripts/preview.mjs — منسوخة يدوياً كي لا يحتاج المسار
// import من script (يكسر عزل route من webpack).
const HEADLINE_LONG =
  'ارتفاع عدد الضحايا جراء الاستهداف الإسرائيلي المتواصل لمنتظري المساعدات شمالي القطاع';
const HEADLINE_MED = 'مؤتمر السلام الدولي ينطلق _غداً_ في بروكسل';
const HEADLINE_SHORT = 'قمة عربية طارئة';
const TITLE_REEL = 'الحرب في غزة';
const KICKER_TEXT = 'تقرير خاص';
const LOCATION = 'غزة';
const SOURCE_TEXT = 'مصدر طبي — مراسلنا';

const CONTENT_BY_TEMPLATE: Record<string, Record<string, unknown>> = {
  breaking: { headline: HEADLINE_LONG, source: SOURCE_TEXT },
  card_centered: { headline: HEADLINE_MED },
  card_bottom: { headline: HEADLINE_MED },
  card_kicker: { kicker: KICKER_TEXT, headline: HEADLINE_SHORT },
  reel: { title: TITLE_REEL, location: LOCATION },
  plain: { headline: HEADLINE_LONG },
};

// SIZE ثابت في preview.mjs — لا اختراع.
const SIZE = { w: 1080, h: 1350 };

// الأسماء المُعادة تُطابق ملفات snapshots/ — نمط `preview-<brand>[-<template>]`
// حيث `<brand>` من قائمة معروفة (`default` أو `client-demo`) و`<template>`
// اختياري (غيابه = `breaking`، افتراض preview.mjs السطر 266).
const KNOWN_BRANDS = ['default', 'client-demo'];
function parseSampleName(name: string): { brand: string; template: string } | null {
  if (!name.startsWith('preview-')) return null;
  const rest = name.slice('preview-'.length);
  for (const b of KNOWN_BRANDS) {
    if (rest === b) return { brand: b, template: 'breaking' };
    if (rest.startsWith(b + '-')) {
      const tpl = rest.slice(b.length + 1).replace(/-/g, '_');
      return { brand: b, template: tpl };
    }
  }
  return null;
}

export async function GET(
  _req: Request,
  { params }: { params: { name: string } }
): Promise<Response> {
  const parsed = parseSampleName(params.name);
  if (!parsed) return Response.json({ error: 'invalid-sample-name' }, { status: 400 });
  const { brand, template } = parsed;

  // brand: default = DEFAULT_BRAND من packages/shared. غيره من brands/<name>.json
  let brandJson: unknown;
  if (brand === 'default') {
    // نُعيد الاسم فقط — العميل يستورد DEFAULT_BRAND من packages/shared.
    brandJson = { __useDefault: true };
  } else {
    try {
      brandJson = JSON.parse(
        await readFile(join(ROOT, 'brands', `${brand}.json`), 'utf8')
      );
    } catch {
      return Response.json({ error: 'brand-not-found', brand }, { status: 404 });
    }
  }

  // template: من packages/templates/src/templates/<name>.json
  const tplPath = join(ROOT, 'packages', 'templates', 'src', 'templates', `${template.replace(/_/g, '-')}.json`);
  let templateJson: unknown;
  try {
    templateJson = JSON.parse(await readFile(tplPath, 'utf8'));
  } catch {
    return Response.json({ error: 'template-not-found', template, tried: tplPath }, { status: 404 });
  }

  const content = CONTENT_BY_TEMPLATE[template] ?? {};

  return Response.json({
    brand: brandJson,
    template: templateJson,
    content,
    size: SIZE,
    fontFile: 'IBMPlexSansArabic-Regular.ttf',
  });
}
