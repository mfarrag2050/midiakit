'use client';

import { useEffect, useState } from 'react';
import { Button } from '@pf-mediakit/ui';
import { useLocale } from '@pf-mediakit/i18n';

// 330-THREE-LEAKS-AND-A-LIE · overlay عالميّ يظهر حين client.ts يكتشف
// انتهاء جلسة CF Access (302 → cloudflareaccess.com). الرسالة الصحيحة
// «انتهت جلستك — أعِد تحميل الصفحة للدخول» + زرّ «إعادة التحميل».
// **لا نُخفي شيئاً · لا نستبدل أيّ رسالة أخرى** — نُضيف طبقة تُفسّر ما
// جرى للمستعمل مع فعل تالٍ صريح (§2 من التذكرة: كلّ رسالة خطأ بلا فعلٍ
// تالٍ عيب).
//
// يستمع لحدث `mk:auth-session-expired` من client.ts. مرّة واحدة تكفي —
// بعد ظهور الـoverlay لا نُخفيه إلّا بضغطة إعادة التحميل.

export function AuthExpiredBanner(): JSX.Element | null {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const handler = (): void => setVisible(true);
    window.addEventListener('mk:auth-session-expired', handler);
    return (): void =>
      window.removeEventListener('mk:auth-session-expired', handler);
  }, []);

  if (!visible) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="auth-expired-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
    >
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-soft">
        <div className="mb-3 flex items-start gap-3">
          <span aria-hidden className="text-lg text-warning">
            ⚠
          </span>
          <div className="flex-1">
            <h2 id="auth-expired-title" className="text-sm font-semibold">
              {t('errors.AUTH_SESSION_EXPIRED')}
            </h2>
          </div>
        </div>
        <div className="mt-4 flex justify-end">
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              if (typeof window !== 'undefined') window.location.reload();
            }}
          >
            {t('auth.expiredBanner.reload')}
          </Button>
        </div>
      </div>
    </div>
  );
}
