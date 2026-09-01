import { createHmac, timingSafeEqual } from 'crypto';

/**
 * CredoPay signs every payment callback so the receiver can prove the message
 * came from CredoPay and was not tampered with in transit.
 *
 * The signed message is the order id, the payment id and the receipt id joined
 * by "|", hashed with HMAC-SHA256 using the merchant's client secret.
 *
 * When no receiptId was supplied at order creation the third segment is an empty
 * string, so the message still ends with a trailing "|".
 */
export function buildSignatureMessage(
  orderId: string,
  paymentId: string,
  receiptId?: string | null,
): string {
  return `${orderId}|${paymentId}|${receiptId ?? ''}`;
}

export function generateSignature(
  clientSecret: string,
  orderId: string,
  paymentId: string,
  receiptId?: string | null,
): string {
  return createHmac('sha256', clientSecret)
    .update(buildSignatureMessage(orderId, paymentId, receiptId))
    .digest('hex');
}

/**
 * Compare a received signature against the one we compute.
 *
 * Uses a constant-time comparison so the number of matching leading characters
 * cannot be inferred from how long the check takes, which would otherwise let an
 * attacker recover a valid signature byte by byte.
 */
export function verifySignature(
  clientSecret: string,
  received: string | undefined | null,
  orderId: string,
  paymentId: string,
  receiptId?: string | null,
): boolean {
  if (!received) return false;

  const expected = generateSignature(clientSecret, orderId, paymentId, receiptId);
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(received.trim(), 'utf8');

  // timingSafeEqual throws on length mismatch, so screen that first. Length is
  // not a secret: it is fixed by the hash algorithm.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
