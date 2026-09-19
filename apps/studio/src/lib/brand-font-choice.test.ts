// ٤٣٠ §٣ · تراجعٌ يحرس أن الهويّات المرفوعةَ قبل معرِض الخطوط تبقى
// تُقرأ كخيار `asset` (لا `builtin` بالخطأ · لا `unset` بحذفٍ صامت).

import { describe, it, expect } from 'vitest';
import { interpretBrandFont } from './brand-font-choice';

describe('interpretBrandFont · ٤٣٠ §٣ (تراجع الخطوط المرفوعة)', () => {
  it('config قديم: خطّ مرفوع (source=custom + weights.regular.assetId) ⇒ asset', () => {
    const cfg = {
      fonts: {
        primary: {
          family: 'MyBrandFont',
          source: 'custom',
          weights: {
            regular: { url: '', value: 400, assetId: 'ast_01H7X8UPLOAD' },
          },
        },
      },
    };
    expect(interpretBrandFont(cfg)).toEqual({
      kind: 'asset',
      id: 'ast_01H7X8UPLOAD',
    });
  });

  it('config قديم بلا `source`: assetId موجود ⇒ asset', () => {
    // هويّاتٌ ما قبل 360b قد تفتقر `source` أصلاً — assetId وحده يكفي.
    const cfg = {
      fonts: {
        primary: {
          family: 'MyBrandFont',
          weights: { regular: { assetId: 'ast_legacy' } },
        },
      },
    };
    expect(interpretBrandFont(cfg)).toEqual({
      kind: 'asset',
      id: 'ast_legacy',
    });
  });

  it('config جديد: خطّ مدمَج (source=builtin + family معلومة) ⇒ builtin', () => {
    const cfg = {
      fonts: { primary: { family: 'Almarai', source: 'builtin' } },
    };
    expect(interpretBrandFont(cfg)).toEqual({
      kind: 'builtin',
      family: 'Almarai',
    });
  });

  it('source=builtin بعائلةٍ غير مدمَجة ⇒ لا يُقبَل خطاً مدمَجاً', () => {
    // حماية: عائلةٌ اختفت من `BUILTIN_FONTS` لا تظهر مختارةً · تسقط إلى unset.
    const cfg = {
      fonts: { primary: { family: 'DeletedFamily', source: 'builtin' } },
    };
    expect(interpretBrandFont(cfg)).toEqual({ kind: 'unset' });
  });

  it('config فارغ أو غير موجود ⇒ unset', () => {
    expect(interpretBrandFont({})).toEqual({ kind: 'unset' });
    expect(interpretBrandFont(null)).toEqual({ kind: 'unset' });
    expect(interpretBrandFont({ fonts: {} })).toEqual({ kind: 'unset' });
  });

  it('الأسبقيّة: source=builtin يتقدّم حين يجتمع مع assetId في `regular`', () => {
    // نادر لكن ممكن (هوية هُوجرت جزئياً). المستخدم يرى المدمَج كما هو
    // متوقّع من `source`. لا كسر تراجع لأن هذه الحالة لم تكن ممكنةً قبل
    // ٤٣٠ (المسار القديم كان يكتب `source='custom'` عند رفع خطّ).
    const cfg = {
      fonts: {
        primary: {
          family: 'IBM Plex Sans Arabic',
          source: 'builtin',
          weights: { regular: { assetId: 'ast_should_not_win' } },
        },
      },
    };
    expect(interpretBrandFont(cfg)).toEqual({
      kind: 'builtin',
      family: 'IBM Plex Sans Arabic',
    });
  });
});
