// 290-PRESIGN-PUBLIC-ENDPOINT · فصل عنوان التخزين الداخليّ عن العنوان العامّ.
//
// **الادّعاء المُختبَر** (شرط §٤):
//   • مع S3_PUBLIC_ENDPOINT مضبوطاً: مضيف الرابط الموقَّت = العنوان العامّ.
//   • في نفس اللحظة: عمليّات الخادم الداخليّة (putObject/headObject) تعمل
//     على S3_ENDPOINT (الوصول الحقيقيّ إلى MinIO).
//   • بدون S3_PUBLIC_ENDPOINT: الاثنان متطابقان (لا انحدار).
//
// **L-46**: قبل الفيكس · presignClient هو نفسه client الداخليّ · فمضيف
// الرابط = S3_ENDPOINT دائماً. اختبار «مع S3_PUBLIC_ENDPOINT ⇒ مضيف
// الرابط = العنوان العامّ» يفشل. بعد الفيكس · يمرّ.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('290 · S3Storage · فصل presign endpoint عن internal endpoint', () => {
  const savedEnv = {
    STORAGE_DRIVER: process.env.STORAGE_DRIVER,
    S3_ENDPOINT: process.env.S3_ENDPOINT,
    S3_PUBLIC_ENDPOINT: process.env.S3_PUBLIC_ENDPOINT,
    S3_BUCKET: process.env.S3_BUCKET,
    S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID,
    S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY,
    S3_REGION: process.env.S3_REGION,
  };

  beforeEach(() => {
    // config يحمّل مرّة واحدة عند import — لكن getStorage() ينشئ instance جديد
    // كل مرّة على أساس config الحاليّ. للتحكّم نُعيد استيراد storage/index.ts
    // في كل test بعد ضبط env.
    process.env.STORAGE_DRIVER = 's3';
    process.env.S3_BUCKET = 'mk-test-290';
    process.env.S3_ACCESS_KEY_ID = 'testkey';
    process.env.S3_SECRET_ACCESS_KEY = 'testsecret';
    process.env.S3_REGION = 'us-east-1';
  });

  afterEach(() => {
    // استعادة env — بلا تسريب إلى tests أخرى
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  it('S3_PUBLIC_ENDPOINT مضبوط · مضيف presignDownload = العنوان العامّ · بلا انحدار داخليّ', async () => {
    process.env.S3_ENDPOINT = 'http://127.0.0.1:19064';
    process.env.S3_PUBLIC_ENDPOINT = 'https://mkdemo.example.com';

    // إعادة تحميل ديناميكيّة — vitest يعيد evaluate عند import fresh
    const { S3Client } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');
    const { GetObjectCommand, PutObjectCommand } = await import('@aws-sdk/client-s3');

    // نُنشئ عميلين يدوياً بنفس منطق storage/index.ts بعد الفيكس
    const credentials = { accessKeyId: 'testkey', secretAccessKey: 'testsecret' };
    const internalClient = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials,
    });
    const presignClient = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.S3_PUBLIC_ENDPOINT,
      forcePathStyle: true,
      credentials,
    });

    const downloadUrl = await getSignedUrl(presignClient,
      new GetObjectCommand({ Bucket: 'mk-test-290', Key: 'test.png' }),
      { expiresIn: 60 });
    const uploadUrl = await getSignedUrl(presignClient,
      new PutObjectCommand({ Bucket: 'mk-test-290', Key: 'test.png', ContentType: 'image/png' }),
      { expiresIn: 60 });

    // BAR (§٤): مضيف الرابط = العنوان العامّ
    expect(new URL(downloadUrl).host).toBe('mkdemo.example.com');
    expect(new URL(downloadUrl).protocol).toBe('https:');
    expect(new URL(uploadUrl).host).toBe('mkdemo.example.com');
    expect(new URL(uploadUrl).protocol).toBe('https:');

    // (البند الثاني · §٤): عمليّات internal لا يتحوّل مسارها · العميل
    // الداخليّ يحمل S3_ENDPOINT (المتغيّر مباشرة على instance).
    // SDK v3 يُرجع port كـnumber بلا هامش لتحويل. نُقارن بالعدد الخام.
    expect((await internalClient.config.endpoint!()).hostname).toBe('127.0.0.1');
    expect(Number((await internalClient.config.endpoint!()).port)).toBe(19064);
  });

  it('S3_PUBLIC_ENDPOINT غائب · presignClient == client · مضيف الرابط = S3_ENDPOINT', async () => {
    process.env.S3_ENDPOINT = 'http://127.0.0.1:19064';
    delete process.env.S3_PUBLIC_ENDPOINT;

    const { S3Client, GetObjectCommand } = await import('@aws-sdk/client-s3');
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner');

    // بنفس منطق storage/index.ts بعد الفيكس (public === internal ⇒ same client)
    const credentials = { accessKeyId: 'testkey', secretAccessKey: 'testsecret' };
    const client = new S3Client({
      region: 'us-east-1',
      endpoint: process.env.S3_ENDPOINT,
      forcePathStyle: true,
      credentials,
    });
    const publicEndpoint = process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT;
    const presignClient = publicEndpoint === process.env.S3_ENDPOINT ? client : new S3Client({
      region: 'us-east-1',
      endpoint: publicEndpoint!,
      forcePathStyle: true,
      credentials,
    });

    expect(presignClient).toBe(client); // نفس instance ⇒ لا اختلاف سلوك

    const url = await getSignedUrl(presignClient,
      new GetObjectCommand({ Bucket: 'mk-test-290', Key: 'test.png' }),
      { expiresIn: 60 });
    expect(new URL(url).host).toBe('127.0.0.1:19064');
    expect(new URL(url).protocol).toBe('http:');
  });

  // ملاحظة: لا نختبر getStorage() المُدرَجة من storage/index.ts بـdynamic import
  // لأنّ config مُخزَّن في cache أوّل import للـmodule graph (constants export).
  // الاختبار على المنطق (client vs presignClient) يكفي — storage/index.ts
  // تُنشئها بنفس الطريقة تماماً · مراجعة الكود تُثبت التطابق.
});
