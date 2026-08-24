import * as crypto from 'crypto';

/**
 * Airpay v4 cryptography helpers.
 *
 * Airpay wraps every request/response in AES-256-CBC and authenticates the
 * payload with a SHA-256 checksum. The scheme is defined here:
 *   https://docs.airpay.co.in/v4/getting-started-guide/encryption/
 *   https://docs.airpay.co.in/v4/getting-started-guide/decryption/
 *   https://docs.airpay.co.in/v4/getting-started-guide/checksum/
 *
 * Reference PHP:
 *   $iv  = bin2hex(openssl_random_pseudo_bytes(8));            // 16 ASCII chars
 *   $raw = openssl_encrypt($data,'AES-256-CBC',$key,OPENSSL_RAW_DATA,$iv);
 *   $out = $iv . base64_encode($raw);
 *
 * Note the IV travels as 16 *ASCII characters* (hex text), not 8 raw bytes, and
 * the key is the 32-character key string used directly as the AES-256 key.
 */

/** Encrypt a payload the way Airpay expects: `iv(16 chars) + base64(ciphertext)`. */
export function airpayEncrypt(plaintext: string, encryptionKey: string): string {
  const iv = crypto.randomBytes(8).toString('hex'); // 16 ASCII chars
  const cipher = crypto.createCipheriv(
    'aes-256-cbc',
    Buffer.from(encryptionKey, 'utf8'),
    Buffer.from(iv, 'utf8'),
  );
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return iv + encrypted.toString('base64');
}

/** Reverse of {@link airpayEncrypt}. Returns the decrypted plaintext. */
export function airpayDecrypt(payload: string, encryptionKey: string): string {
  const iv = payload.slice(0, 16);
  const ciphertext = Buffer.from(payload.slice(16), 'base64');
  const decipher = crypto.createDecipheriv(
    'aes-256-cbc',
    Buffer.from(encryptionKey, 'utf8'),
    Buffer.from(iv, 'utf8'),
  );
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}

/** Decrypt and JSON-parse an Airpay response, returning null if it cannot be read. */
export function airpayDecryptJson<T = any>(payload: string, encryptionKey: string): T | null {
  try {
    return JSON.parse(airpayDecrypt(payload, encryptionKey)) as T;
  } catch {
    return null;
  }
}

/**
 * Checksum = SHA256( concat(values sorted by key) + yyyy-mm-dd ).
 *
 * The date is Airpay's server date, so it must be computed in IST rather than
 * the host timezone — otherwise the checksum silently breaks for several hours
 * a day whenever the two dates differ.
 */
export function airpayChecksum(data: Record<string, unknown>, date: Date = new Date()): string {
  const concatenated = Object.keys(data)
    .sort()
    .map((k) => String(data[k]))
    .join('');
  return crypto
    .createHash('sha256')
    .update(concatenated + istDateString(date))
    .digest('hex');
}

/** Current date in Asia/Kolkata as `YYYY-MM-DD`. */
export function istDateString(date: Date = new Date()): string {
  return new Date(date.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** privatekey = sha256(secret + '@' + username + ':|:' + password) */
export function airpayPrivateKey(secret: string, username: string, password: string): string {
  return crypto.createHash('sha256').update(`${secret}@${username}:|:${password}`).digest('hex');
}

/** CRC32 (IEEE, as used by PHP's crc32) returned as an unsigned decimal string. */
export function crc32(input: string): string {
  let table = CRC_TABLE;
  if (!table) {
    table = CRC_TABLE = new Int32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[i] = c;
    }
  }
  let crc = -1;
  const bytes = Buffer.from(input, 'utf8');
  for (let i = 0; i < bytes.length; i++) {
    crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
  }
  return ((crc ^ -1) >>> 0).toString();
}
let CRC_TABLE: Int32Array | null = null;

/**
 * Verify the `ap_SecureHash` returned with a transaction response.
 *
 * crc32(TRANSACTIONID:APTRANSACTIONID:AMOUNT:TRANSACTIONSTATUS:MESSAGE:MID:USERNAME)
 * and, when the channel is UPI, with `:CUSTOMER_VPA` appended.
 */
export function buildSecureHash(parts: {
  orderId: string;
  apTransactionId: string | number;
  amount: string | number;
  transactionStatus: string | number;
  message: string;
  merchantId: string;
  username: string;
  customerVpa?: string;
}): string {
  const fields = [
    parts.orderId,
    parts.apTransactionId,
    parts.amount,
    parts.transactionStatus,
    parts.message,
    parts.merchantId,
    parts.username,
  ];
  if (parts.customerVpa) fields.push(parts.customerVpa);
  return crc32(fields.join(':'));
}

/** Constant-time comparison so a wrong hash cannot be probed byte by byte. */
export function secureHashMatches(expected: string, received: string): boolean {
  const a = Buffer.from(String(expected));
  const b = Buffer.from(String(received));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
