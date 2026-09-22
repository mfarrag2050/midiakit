'use client';

// ٣٩٠ § ١ · افتح الأنبوب — عرضُ فشلِ الرندر بلا رمي المعلومات
//
// **قبل:** `renderRow.status === 'failed'` كان يعطي جملةً واحدةً — «فشل
// التصدير» — لكلّ أسبابِ الدنيا (٧٢٠ § ٢ الصفّ ١). فقدُ خطّ · فقدُ
// صورة · انقطاعُ S3 · حصّة · قالبٌ فاسد — كلُّها بلا تمييز، ودعمُنا
// يفتح DB يدويّاً ليعرف.
//
// **بعد:** يقرأ `renderRow.error.code`، يترجمه من `ar.json`، ويسقط
// إلى «فشل التصدير — لم نتعرَّف على السبب. أَرسِلْ رمزَ الحادثةِ إلى
// الدعم.» + الرمزُ كرمزٍ لاتينيّ محاصرٍ بـ`dir="ltr"` إن غاب المفتاح.
// **لا يعرض `error.message` أبداً** — ٧٢٠ § ١.٣ يوثّق أنّه إنجليزيٌّ
// خامٌ وقد يحمل تسريباً داخليّاً.

import type { JSX } from 'react';
import { Alert } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';
import type { RenderRow } from '@/src/api/endpoints/renders';
import { actionKeyFor } from '@/src/api/error-action';
import { CopyableCode } from './CopyableCode';

export function RenderFailureAlert({ row }: { row: RenderRow }): JSX.Element {
  const { t, has } = useLocale();
  const code = row.error?.code;
  const key = code ? `errors.${code}` : null;
  const translated = key !== null && has(key);
  // ٣٩٠ §٢ — «ماذا أفعل الآن؟» — كلُّ فشلٍ يحمل فعلاً مقترَحاً
  // مربوطاً بصنف الرمز (`error-action.ts`). الغريبُ عن الخريطة يقع
  // على `CONTACT_SUPPORT` — الأمانُ الأقوى.
  const action = t(actionKeyFor(code));

  return (
    <Alert
      kind="danger"
      titleKey={translated ? key! : 'pages.projects.editor.renderFailedGeneric'}
    >
      <p className="text-xs text-fg-muted">{action}</p>
      {!translated && code && (
        <p className="mt-1 text-xs text-fg-muted">
          {t('pages.projects.editor.renderFailedCode')}{' '}
          <span dir="ltr" className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px]">
            {code}
          </span>
        </p>
      )}
      {/* ٣٩٠ §٣ — رمزُ الحادثة (UUID الرندر): مستقرٌّ عبر restart، يربطُ
          الشكوى بالصفّ في القاعدة، لاتينيٌّ داخل نصٍّ عربيّ ⇒ dir="ltr". */}
      <div className="mt-2">
        <CopyableCode value={row.id} labelKey="pages.projects.editor.renderIdLabel" />
      </div>
    </Alert>
  );
}
