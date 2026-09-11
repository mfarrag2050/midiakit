/**
 * ai/crypto — AES-256-GCM تشفير/فكّ لمفاتيح مزوّدي AI (A24).
 *
 * تنسيق البايتات المخزَّنة في `ai_integrations.api_key_encrypted`:
 *   nonce (12 بايت) || auth_tag (16 بايت) || ciphertext (N بايت)
 *
 * المفتاح: `AI_KEY_ENCRYPTION_KEY` من env، 32 بايت (64 hex). إن ضاع،
 * كل الصفوف تصير دائمة الفقدان — انظر PHASES-api.md §A24.
 *
 * لماذا GCM: authenticated encryption ⇒ tampering يُكتشف. `additionalData`
 * = `tenant_id` (يمنع صفّاً منقولاً بين مستأجرين — النقل يفشل تحقّق tag).
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { config } from '../config.js';

const ALG = 'aes-256-gcm';
const NONCE_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  // config.ts فحص الطول والصيغة عند الإقلاع.
  return Buffer.from(config.AI_KEY_ENCRYPTION_KEY, 'hex');
}

/**
 * يشفّر النصّ الصريح إلى Buffer محدَّد التنسيق أعلاه.
 * `tenantId` يُستعمل كـadditionalData — نقل الصفّ بين مستأجرين يفشل الفكّ.
 */
export function encryptApiKey(plaintext: string, tenantId: string): Buffer {
  const key = getKey();
  const nonce = randomBytes(NONCE_LEN);
  const cipher = createCipheriv(ALG, key, nonce);
  cipher.setAAD(Buffer.from(tenantId, 'utf8'));
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, tag, enc]);
}

/**
 * يفكّ Buffer المخزَّن ⇒ النصّ الصريح. يرمي إن فشل التحقّق (مفتاح
 * خاطئ، صفّ منقول، tampering).
 */
export function decryptApiKey(encrypted: Buffer, tenantId: string): string {
  if (encrypted.length < NONCE_LEN + TAG_LEN + 1) {
    throw new Error('encrypted buffer too short');
  }
  const key = getKey();
  const nonce = encrypted.subarray(0, NONCE_LEN);
  const tag = encrypted.subarray(NONCE_LEN, NONCE_LEN + TAG_LEN);
  const ciphertext = encrypted.subarray(NONCE_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALG, key, nonce);
  decipher.setAAD(Buffer.from(tenantId, 'utf8'));
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return dec.toString('utf8');
}

/** يُنشئ `kref_{uuid}` مرجعاً للمفتاح. لا صلة عددية بالقيمة. */
export function generateKeyRef(): string {
  // UUID v4 بلا شرطات — kref_ + 32 hex
  return `kref_${randomBytes(16).toString('hex')}`;
}
