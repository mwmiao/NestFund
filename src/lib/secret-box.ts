import crypto from 'node:crypto';

// AES-256-GCM authenticated encryption for secrets stored in SQLite (e.g. broker API keys).
// Format: "v1:" + base64(iv[12] | tag[16] | ciphertext).

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return 'v1:' + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

export function decryptSecret(box: string, key: Buffer): string {
  if (!box.startsWith('v1:')) throw new Error('Unsupported secret format');
  const raw = Buffer.from(box.slice(3), 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
  decipher.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
}

/** Derives a 32-byte key from a passphrase (NESTFUND_SECRET) or returns raw key-file bytes as-is. */
export function keyFromPassphrase(passphrase: string): Buffer {
  return crypto.createHash('sha256').update(`nestfund:${passphrase}`).digest();
}
