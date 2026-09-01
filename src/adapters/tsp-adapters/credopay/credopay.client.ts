import { verifySignature } from './credopay.crypto';

export interface CredoPayConfig {
  clientId: string;
  clientSecret: string;
  /** Base URL including the /nac suffix, e.g. https://ucpbsapi.credopay.info/nac */
  baseUrl: string;
}

export interface CreateOrderInput {
  amount: number;
  currency?: string;
  receiptId?: string;
  description?: string;
  /** Passed through to the callback unchanged; useful for correlation. */
  curn?: string;
  customer: { name: string; email: string; phone: string };
}

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  receiptId?: string;
  amount?: number;
  resCode?: number;
  errMessage?: string;
}

export type CredoPayStatus =
  | 'success'
  | 'failure'
  | 'pending'
  | 'not_initiated'
  | 'unknown';

export interface StatusResult {
  status: CredoPayStatus;
  orderId?: string;
  paymentId?: string;
  receiptId?: string;
  amount?: number;
  signature?: string;
  /** True only when a signature was present AND verified against our secret. */
  signatureValid?: boolean;
  raw: unknown;
}

/** Payload CredoPay POSTs to the merchant webhook after a payment attempt. */
export interface CredoPayCallback {
  orderId: string;
  paymentId: string;
  status: string;
  receiptId?: string;
  signature?: string;
}

/**
 * Thin client for CredoPay's payment gateway.
 *
 * Verified against the UAT environment: order creation, status check and the
 * hosted checkout redirect. Requests authenticate with HTTP basic auth using the
 * client id and client secret issued during merchant onboarding.
 */
export class CredoPayClient {
  constructor(private readonly config: CredoPayConfig) {}

  private authHeader(): string {
    const raw = `${this.config.clientId}:${this.config.clientSecret}`;
    return `Basic ${Buffer.from(raw).toString('base64')}`;
  }

  private url(path: string): string {
    return `${this.config.baseUrl.replace(/\/+$/, '')}${path}`;
  }

  /**
   * Create an order. The returned orderId is what the browser hands to the
   * hosted checkout; creating it server-side is what stops a customer editing
   * the amount before paying.
   */
  async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const body = {
      amount: Number(input.amount.toFixed(2)),
      currency: input.currency ?? 'INR',
      uiMode: 'checkout',
      ...(input.receiptId ? { receiptId: input.receiptId } : {}),
      ...(input.description ? { description: input.description } : {}),
      ...(input.curn ? { curn: input.curn } : {}),
      customerFields: {
        email: input.customer.email,
        phone: input.customer.phone,
        name: input.customer.name,
      },
    };

    const res = await fetch(this.url('/api/v1/pg/orders/create-checkout'), {
      method: 'POST',
      headers: {
        Authorization: this.authHeader(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    const data: any = await res.json().catch(() => ({}));

    // CredoPay reports failures in the body with HTTP 200, so trust the body.
    if (data?.status === 'success' && data?.orderId) {
      return {
        success: true,
        orderId: data.orderId,
        receiptId: data.receiptId,
        amount: data.amount,
        resCode: data.resCode,
      };
    }

    return {
      success: false,
      resCode: data?.resCode ?? res.status,
      errMessage: data?.errMessage || `Order creation failed (HTTP ${res.status})`,
    };
  }

  /**
   * URL to send the customer to in order to pay. This is a plain redirect; the
   * checkout.js helper CredoPay ships does nothing more than build this URL.
   */
  buildCheckoutUrl(orderId: string, redirectUrl: string): string {
    const params = new URLSearchParams({
      actionType: 'checkout',
      orderId,
      redirectUrl,
      clientId: this.config.clientId,
    });
    return `https://retaildash.credopay.info/cpbs/pg?${params.toString()}`;
  }

  /** Server-side confirmation of a payment. Safe to poll. */
  async checkStatus(orderId: string): Promise<StatusResult> {
    const res = await fetch(
      this.url(`/api/v1/pg/orders/check-status?orderId=${encodeURIComponent(orderId)}`),
      { headers: { Authorization: this.authHeader() } },
    );
    const data: any = await res.json().catch(() => ({}));

    const result: StatusResult = {
      status: this.normaliseStatus(data),
      orderId: data?.orderId ?? orderId,
      paymentId: data?.paymentId,
      receiptId: data?.receiptId,
      amount: data?.amount,
      signature: data?.signature,
      raw: data,
    };

    if (data?.signature && data?.paymentId) {
      result.signatureValid = verifySignature(
        this.config.clientSecret,
        data.signature,
        result.orderId!,
        data.paymentId,
        data.receiptId,
      );
    }

    return result;
  }

  private normaliseStatus(data: any): CredoPayStatus {
    const raw = String(data?.status ?? '').toLowerCase();
    if (raw === 'success') return 'success';
    if (raw === 'pending' || raw === 'processing') return 'pending';
    if (raw === 'failure') {
      // "Transaction not initiated" means the order exists but the customer has
      // not paid yet - materially different from a genuine payment failure.
      const msg = String(data?.errMessage ?? '').toLowerCase();
      if (msg.includes('not initiated')) return 'not_initiated';
      return 'failure';
    }
    return 'unknown';
  }

  /**
   * Validate a webhook callback. Returns false unless the signature matches, so
   * an unauthenticated caller cannot mark an order as paid.
   */
  verifyCallback(cb: CredoPayCallback): boolean {
    if (!cb?.orderId || !cb?.paymentId) return false;
    return verifySignature(
      this.config.clientSecret,
      cb.signature,
      cb.orderId,
      cb.paymentId,
      cb.receiptId,
    );
  }
}
