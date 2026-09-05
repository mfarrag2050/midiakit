/**
 * storage — تجريد التخزين. Driver واحد لكل بيئة:
 *   - memory: dev/test — Map في الذاكرة. لا ثبات.
 *   - s3:     production — @aws-sdk/client-s3 + s3-request-presigner.
 *
 * **قرار #2 في A11 (SDK رسمي):** لا استدعاء fetch على URL. SDK يقبل
 * bucket+key فقط، فالحماية بنيوية لا استثنائية. check-no-brand-url-fetch
 * يبقى بصفر استثناءات. s3 driver يستدعي:
 *   - GetSignedUrl(PutObjectCommand)  — رابط رفع موقَّت
 *   - GetSignedUrl(GetObjectCommand)  — رابط قراءة موقَّت
 *   - s3.send(HeadObjectCommand)      — تأكّد اكتمال الرفع (finalize §9.2)
 *   - s3.send(DeleteObjectCommand)    — حذف
 *   - s3.send(GetObjectCommand)       — قراءة نصّ (SVG warning check)
 *   - s3.send(PutObjectCommand)       — dev helper، غير مستعمل في prod
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config.js';

export interface UploadPresign {
  uploadUrl: string;
  expiresAt: Date;
}

export interface DownloadPresign {
  publicUrl: string;
  expiresAt: Date;
}

export interface HeadResult {
  exists: boolean;
  sizeBytes?: number;
  contentType?: string;
}

export interface Storage {
  presignUpload(key: string, contentType: string, sizeBytes: number, ttlSeconds: number): Promise<UploadPresign>;
  presignDownload(key: string, ttlSeconds: number): Promise<DownloadPresign>;
  headObject(key: string): Promise<HeadResult>;
  deleteObject(key: string): Promise<void>;
  getObjectText(key: string): Promise<string>;

  /**
   * dev/test helper — يستعمله verify-assets ليحاكي رفع العميل قبل
   * finalize. في s3 driver يُنفَّذ عبر PutObjectCommand.
   */
  putObjectRaw(key: string, body: Buffer | string, contentType: string): Promise<void>;
}

// ── Memory driver ───────────────────────────────────────────────────
interface MemEntry {
  body: Buffer;
  contentType: string;
}

class MemoryStorage implements Storage {
  private readonly store = new Map<string, MemEntry>();

  async presignUpload(key: string, _contentType: string, _sizeBytes: number, ttlSeconds: number): Promise<UploadPresign> {
    // memory driver: نُعيد رابطاً «حراً» يعمل داخل الأداة فقط، لا HTTP.
    // العميل الحقيقي في dev يستدعي putObjectRaw مباشرة (عبر verify).
    return {
      uploadUrl: `mem://upload/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async presignDownload(key: string, ttlSeconds: number): Promise<DownloadPresign> {
    return {
      publicUrl: `mem://download/${encodeURIComponent(key)}`,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  }

  async headObject(key: string): Promise<HeadResult> {
    const e = this.store.get(key);
    if (!e) return { exists: false };
    return { exists: true, sizeBytes: e.body.length, contentType: e.contentType };
  }

  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }

  async getObjectText(key: string): Promise<string> {
    const e = this.store.get(key);
    if (!e) throw new Error(`memory storage: key not found: ${key}`);
    return e.body.toString('utf-8');
  }

  async putObjectRaw(key: string, body: Buffer | string, contentType: string): Promise<void> {
    const buf = typeof body === 'string' ? Buffer.from(body, 'utf-8') : body;
    this.store.set(key, { body: buf, contentType });
  }
}

// ── S3 driver ────────────────────────────────────────────────────────
class S3Storage implements Storage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = config.S3_BUCKET;
    this.client = new S3Client({
      region: config.S3_REGION,
      ...(config.S3_ENDPOINT ? { endpoint: config.S3_ENDPOINT, forcePathStyle: true } : {}),
      ...(config.S3_ACCESS_KEY_ID && config.S3_SECRET_ACCESS_KEY
        ? {
            credentials: {
              accessKeyId: config.S3_ACCESS_KEY_ID,
              secretAccessKey: config.S3_SECRET_ACCESS_KEY,
            },
          }
        : {}),
    });
  }

  async presignUpload(key: string, contentType: string, _sizeBytes: number, ttlSeconds: number): Promise<UploadPresign> {
    const cmd = new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
    return { uploadUrl: url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  async presignDownload(key: string, ttlSeconds: number): Promise<DownloadPresign> {
    const cmd = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    const url = await getSignedUrl(this.client, cmd, { expiresIn: ttlSeconds });
    return { publicUrl: url, expiresAt: new Date(Date.now() + ttlSeconds * 1000) };
  }

  async headObject(key: string): Promise<HeadResult> {
    try {
      const r = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        exists: true,
        sizeBytes: r.ContentLength ?? 0,
        contentType: r.ContentType ?? 'application/octet-stream',
      };
    } catch (err: unknown) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotFound' || name === 'NoSuchKey') return { exists: false };
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async getObjectText(key: string): Promise<string> {
    const r = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!r.Body) throw new Error(`s3 storage: empty body: ${key}`);
    return await r.Body.transformToString('utf-8');
  }

  async putObjectRaw(key: string, body: Buffer | string, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: this.bucket, Key: key,
      Body: typeof body === 'string' ? Buffer.from(body, 'utf-8') : body,
      ContentType: contentType,
    }));
  }
}

// ── Singleton ────────────────────────────────────────────────────────
let instance: Storage | null = null;

export function getStorage(): Storage {
  if (instance) return instance;
  instance = config.STORAGE_DRIVER === 's3' ? new S3Storage() : new MemoryStorage();
  return instance;
}

/** dev helper — لأدوات verify فقط. */
export function __resetStorage(): void {
  instance = null;
}
