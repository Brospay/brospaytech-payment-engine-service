import {
  PayUHashInput,
  generateRequestHash,
  generateVerifyApiHash,
  verifyResponseHash,
} from './payu.crypto';

export interface PayUConfig {
  key: string;
  salt: string;
  /** false uses test.payu.in, true uses secure.payu.in */
  production?: boolean;
}

export interface PayUPaymentInput {
  txnid: string;
  amount: number;
  productinfo: string;
  firstname: string;
  email: string;
  phone: string;
  surl: string;
  furl: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

/** Everything needed to POST the customer to PayU's hosted checkout. */
export interface PayUCheckoutForm {
  action: string;
  fields: Record<string, string>;
}

export type PayUStatus = 'success' | 'failure' | 'pending' | 'unknown';

export interface PayUVerifyResult {
  status: PayUStatus;
  txnid: string;
  mihpayid?: string;
  amount?: string;
  mode?: string;
  message?: string;
  raw: unknown;
}

/**
 * PayU hosted checkout ("non-seamless"): we never touch card data, so this
 * avoids the PCI-DSS obligations that PayU's seamless flow imposes.
 */
export class PayUClient {
  constructor(private readonly config: PayUConfig) {}

  private get paymentUrl(): string {
    return this.config.production
      ? 'https://secure.payu.in/_payment'
      : 'https://test.payu.in/_payment';
  }

  private get verifyUrl(): string {
    return this.config.production
      ? 'https://info.payu.in/merchant/postservice?form=2'
      : 'https://test.payu.in/merchant/postservice?form=2';
  }

  /**
   * Build the signed checkout form. Amount is formatted to two decimals and the
   * SAME string is both hashed and posted - hashing a differently formatted
   * amount than the one sent is the classic cause of "hash mismatch".
   */
  buildCheckoutForm(input: PayUPaymentInput): PayUCheckoutForm {
    const amount = input.amount.toFixed(2);

    const hashInput: PayUHashInput = {
      key: this.config.key,
      txnid: input.txnid,
      amount,
      productinfo: input.productinfo,
      firstname: input.firstname,
      email: input.email,
      udf1: input.udf1,
      udf2: input.udf2,
      udf3: input.udf3,
      udf4: input.udf4,
      udf5: input.udf5,
    };

    const fields: Record<string, string> = {
      key: this.config.key,
      txnid: input.txnid,
      amount,
      productinfo: input.productinfo,
      firstname: input.firstname,
      email: input.email,
      phone: input.phone,
      surl: input.surl,
      furl: input.furl,
      hash: generateRequestHash(hashInput, this.config.salt),
    };
    for (const k of ['udf1', 'udf2', 'udf3', 'udf4', 'udf5'] as const) {
      if (input[k]) fields[k] = input[k]!;
    }

    return { action: this.paymentUrl, fields };
  }

  /**
   * Validate a callback from PayU. Returns false unless the reverse hash
   * matches, so a forged browser POST cannot mark an order as paid.
   */
  verifyCallback(body: Record<string, any>): boolean {
    if (!body?.txnid || !body?.status) return false;
    return verifyResponseHash(
      body.hash,
      {
        key: this.config.key,
        txnid: String(body.txnid),
        amount: String(body.amount),
        productinfo: String(body.productinfo ?? ''),
        firstname: String(body.firstname ?? ''),
        email: String(body.email ?? ''),
        udf1: body.udf1,
        udf2: body.udf2,
        udf3: body.udf3,
        udf4: body.udf4,
        udf5: body.udf5,
        status: String(body.status),
        additionalCharges: body.additionalCharges,
      },
      this.config.salt,
    );
  }

  /**
   * Server-side confirmation. The callback is browser-driven and can be dropped
   * if the customer closes the tab, so the money decision should rest on this.
   */
  async verifyPayment(txnid: string): Promise<PayUVerifyResult> {
    const command = 'verify_payment';
    const body = new URLSearchParams({
      key: this.config.key,
      command,
      var1: txnid,
      hash: generateVerifyApiHash(this.config.key, command, txnid, this.config.salt),
    });

    const res = await fetch(this.verifyUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data: any = await res.json().catch(() => ({}));
    const txn = data?.transaction_details?.[txnid];

    return {
      status: this.normalise(txn?.status),
      txnid,
      mihpayid: txn?.mihpayid,
      amount: txn?.amt ?? txn?.amount,
      mode: txn?.mode,
      message: txn?.error_Message ?? data?.msg,
      raw: data,
    };
  }

  private normalise(status?: string): PayUStatus {
    const s = String(status ?? '').toLowerCase();
    if (s === 'success' || s === 'captured') return 'success';
    if (s === 'failure' || s === 'failed') return 'failure';
    if (s === 'pending' || s === 'in progress') return 'pending';
    return 'unknown';
  }
}
