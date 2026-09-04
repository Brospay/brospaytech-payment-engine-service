import { createHash, timingSafeEqual } from 'crypto';

/**
 * PayU signs both directions with SHA-512 over a pipe-joined string.
 *
 * The exact field order and the empty segments matter: PayU reserves five
 * user-defined fields (udf1..udf5) plus five further reserved slots, and every
 * separator must be present even when the value is empty, otherwise the hash
 * will not match and PayU rejects the request.
 */

export interface PayUHashInput {
  key: string;
  txnid: string;
  /** Must be the exact string sent to PayU, e.g. "10.00" - not a rounded number. */
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

const sha512 = (s: string) => createHash('sha512').update(s).digest('hex');
const u = (v?: string) => v ?? '';

/**
 * Request hash:
 *   sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT)
 * The six empty segments before SALT are PayU's reserved fields.
 */
export function generateRequestHash(input: PayUHashInput, salt: string): string {
  const parts = [
    input.key,
    input.txnid,
    input.amount,
    input.productinfo,
    input.firstname,
    input.email,
    u(input.udf1),
    u(input.udf2),
    u(input.udf3),
    u(input.udf4),
    u(input.udf5),
    '', '', '', '', '', // reserved
    salt,
  ];
  return sha512(parts.join('|'));
}

/**
 * Response hash is the request hash reversed, with `status` inserted after the
 * salt. Recomputing it is the only way to know a callback really came from PayU:
 * the callback is a browser POST, so anyone could otherwise forge a success.
 */
export function generateResponseHash(
  input: PayUHashInput & { status: string; additionalCharges?: string },
  salt: string,
): string {
  const base = [
    salt,
    input.status,
    '', '', '', '', '', // reserved
    u(input.udf5),
    u(input.udf4),
    u(input.udf3),
    u(input.udf2),
    u(input.udf1),
    input.email,
    input.firstname,
    input.productinfo,
    input.amount,
    input.txnid,
    input.key,
  ].join('|');

  // When PayU collects extra charges it prefixes them to the hashed string.
  return sha512(
    input.additionalCharges ? `${input.additionalCharges}|${base}` : base,
  );
}

/** Constant-time compare so a valid hash cannot be discovered by timing. */
function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, 'utf8');
  const y = Buffer.from(b, 'utf8');
  if (x.length !== y.length) return false;
  return timingSafeEqual(x, y);
}

export function verifyResponseHash(
  received: string | undefined | null,
  input: PayUHashInput & { status: string; additionalCharges?: string },
  salt: string,
): boolean {
  if (!received) return false;
  return safeEqual(generateResponseHash(input, salt), received.trim().toLowerCase());
}

/** Verify API (command=verify_payment) uses its own short hash. */
export function generateVerifyApiHash(
  key: string,
  command: string,
  var1: string,
  salt: string,
): string {
  return sha512([key, command, var1, salt].join('|'));
}
