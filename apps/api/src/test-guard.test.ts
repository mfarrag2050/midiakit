// 518 · اختبار حارسِ رفض بيئة العرض.
import { describe, expect, it } from 'vitest';
import { assertNotShowroomEnv } from './test-guard.js';

const DEV_ENV: NodeJS.ProcessEnv = {
  DATABASE_URL: 'postgres://app:x@127.0.0.1:19041/mediakit_dev',
  DATABASE_URL_APP: 'postgres://app:x@127.0.0.1:19041/mediakit_dev',
  REDIS_URL: 'redis://127.0.0.1:19045/3',
  S3_ENDPOINT: 'http://127.0.0.1:19043',
  S3_PUBLIC_ENDPOINT: 'http://127.0.0.1:19043',
};

describe('assertNotShowroomEnv (518)', () => {
  it('يمرّ على قيم dev (19041–19045)', () => {
    expect(() => assertNotShowroomEnv(DEV_ENV)).not.toThrow();
  });

  it('يرمي إذا SHOWROOM_MODE معرَّف', () => {
    expect(() => assertNotShowroomEnv({ ...DEV_ENV, SHOWROOM_MODE: '1' }))
      .toThrow(/SHOWROOM_MODE/);
  });

  it('يرمي إذا ENV_SHOW_VERSION معرَّف', () => {
    expect(() => assertNotShowroomEnv({ ...DEV_ENV, ENV_SHOW_VERSION: 'v1' }))
      .toThrow(/ENV_SHOW_VERSION/);
  });

  it('يرمي على DATABASE_URL يشير إلى منفذ العرض 19062', () => {
    expect(() => assertNotShowroomEnv({
      ...DEV_ENV,
      DATABASE_URL: 'postgres://u:p@127.0.0.1:19062/mediakit_show',
    })).toThrow(/DATABASE_URL/);
  });

  it('يرمي على REDIS_URL يشير إلى منفذ العرض 19063', () => {
    expect(() => assertNotShowroomEnv({
      ...DEV_ENV,
      REDIS_URL: 'redis://127.0.0.1:19063/0',
    })).toThrow(/REDIS_URL/);
  });

  it('يرمي على S3_ENDPOINT يشير إلى منفذ العرض 19064', () => {
    expect(() => assertNotShowroomEnv({
      ...DEV_ENV,
      S3_ENDPOINT: 'http://127.0.0.1:19064',
    })).toThrow(/S3_ENDPOINT/);
  });

  it('يرمي على S3_ENDPOINT يشير إلى mkdemo.primeflow.co', () => {
    expect(() => assertNotShowroomEnv({
      ...DEV_ENV,
      S3_ENDPOINT: 'https://mkdemo.primeflow.co',
    })).toThrow(/S3_ENDPOINT/);
  });

  it('يرمي على منفذ shownext 19084', () => {
    expect(() => assertNotShowroomEnv({
      ...DEV_ENV,
      DATABASE_URL: 'postgres://u:p@127.0.0.1:19084/mediakit_shownext',
    })).toThrow(/DATABASE_URL/);
  });

  it('يرمي إذا اسم القاعدة mediakit_show', () => {
    expect(() => assertNotShowroomEnv({
      ...DEV_ENV,
      DATABASE_URL: 'postgres://u:p@somehost:5432/mediakit_show',
    })).toThrow(/DATABASE_URL/);
  });

  it('اسمُ المتغيّر يُطبَع · القيمة لا (فحص الرسالة)', () => {
    try {
      assertNotShowroomEnv({ ...DEV_ENV, S3_ENDPOINT: 'https://mkdemo.primeflow.co/secret-path' });
      throw new Error('expected throw');
    } catch (e) {
      const msg = (e as Error).message;
      expect(msg).toContain('S3_ENDPOINT');
      expect(msg).not.toContain('secret-path');
      expect(msg).not.toContain('mkdemo');
    }
  });
});
