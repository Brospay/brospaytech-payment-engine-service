import { Injectable, Logger } from '@nestjs/common';
import {
  airpayEncrypt,
  airpayDecryptJson,
  airpayChecksum,
  airpayPrivateKey,
  buildSecureHash,
  secureHashMatches,
} from './airpay.crypto';

export interface AirpayCredentials {
  merchantId: string;
  username: string;
  password: string;
  clientId: string;
  clientSecret: string;
  /** 32-character key issued by Airpay, used for AES-256-CBC on every payload. */
  encryptionKey: string;
  /** Used only to derive `privatekey`. Usually the same value Airpay calls the API key. */
  secret: string;
}

export interface AirpayCheckoutRequest {
  orderId: string;
  amount: number;
  buyerEmail: string;
  buyerPhone: string;
  buyerFirstName: string;
  buyerLastName: string;
  returnUrl?: string;
  /** Restrict the payment methods shown, e.g. 'upi'. Blank shows everything enabled. */
  chmod?: string;
  customVar?: string;
}

/** Everything needed to POST the browser across to Airpay's hosted page. */
export interface AirpayCheckoutForm {
  action: string;
  fields: {
    privatekey: string;
    merchant_id: string;
    encdata: string;
    checksum: string;
  };
}

const OAUTH_URL = 'https://kraken.airpay.co.in/airpay/pay/v4/api/oauth2/';
const PAY_URL = 'https://payments.airpay.co.in/pay/v4/';

/**
 * Airpay v4 gateway client.
 *
 * Flow: fetch an OAuth2 access token, build an encrypted checkout payload, POST
 * the customer's browser to Airpay's hosted page, then verify the transaction
 * response with the `ap_SecureHash` CRC32.
 */
@Injectable()
export class AirpayClient {
  private readonly logger = new Logger(AirpayClient.name);
  private cachedToken: { token: string; expiresAt: number } | null = null;

  /**
   * Obtain an OAuth2 access token. Tokens are cached in memory until shortly
   * before expiry so a burst of checkouts does not re-authenticate every time.
   */
  async getAccessToken(creds: AirpayCredentials): Promise<string> {
    if (this.cachedToken && Date.now() < this.cachedToken.expiresAt) {
      return this.cachedToken.token;
    }

    const data = {
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      merchant_id: creds.merchantId,
      grant_type: 'client_credentials',
    };

    const body = new URLSearchParams({
      merchant_id: creds.merchantId,
      encdata: airpayEncrypt(JSON.stringify(data), creds.encryptionKey),
      checksum: airpayChecksum(data),
    });

    const res = await fetch(OAUTH_URL, { method: 'POST', body });
    const raw = await res.json().catch(() => null);

    if (!raw?.response) {
      throw new Error(`Airpay OAuth2 returned no response payload (HTTP ${res.status})`);
    }

    const decoded = airpayDecryptJson<any>(raw.response, creds.encryptionKey);
    if (!decoded) {
      // Almost always means the encryption key is wrong: Airpay answers with an
      // encrypted error that cannot be read using the key we hold.
      throw new Error(
        'Airpay OAuth2 response could not be decrypted - verify the encryption key issued by Airpay.',
      );
    }

    const token = decoded?.data?.access_token ?? decoded?.access_token;
    if (!token) {
      throw new Error(`Airpay OAuth2 failed: ${decoded?.message ?? JSON.stringify(decoded)}`);
    }

    const ttlSeconds = Number(decoded?.data?.expires_in ?? decoded?.expires_in ?? 3600);
    this.cachedToken = { token, expiresAt: Date.now() + (ttlSeconds - 60) * 1000 };
    return token;
  }

  /**
   * Build the auto-submitting form that hands the customer to Airpay.
   * Airpay expects a browser form POST, not a server-to-server call, so this
   * returns the action URL plus the hidden fields to render.
   */
  async createCheckout(
    creds: AirpayCredentials,
    req: AirpayCheckoutRequest,
  ): Promise<AirpayCheckoutForm> {
    const token = await this.getAccessToken(creds);

    const data: Record<string, string> = {
      orderid: req.orderId,
      amount: req.amount.toFixed(2),
      currency_code: '356',
      iso_currency: 'INR',
      buyer_email: req.buyerEmail,
      buyer_phone: req.buyerPhone,
      buyer_firstname: req.buyerFirstName,
      buyer_lastname: req.buyerLastName,
    };
    if (req.returnUrl) data.return_url = req.returnUrl;
    if (req.chmod) data.chmod = req.chmod;
    if (req.customVar) data.customvar = req.customVar;

    return {
      action: `${PAY_URL}?token=${encodeURIComponent(token)}`,
      fields: {
        privatekey: airpayPrivateKey(creds.secret, creds.username, creds.password),
        merchant_id: creds.merchantId,
        encdata: airpayEncrypt(JSON.stringify(data), creds.encryptionKey),
        checksum: airpayChecksum(data),
      },
    };
  }

  /**
   * Verify a transaction response / callback really came from Airpay.
   * Never mark an order paid without this returning true.
   */
  verifyTransactionResponse(creds: AirpayCredentials, payload: Record<string, any>): boolean {
    const received = payload.ap_SecureHash;
    if (!received) return false;

    const expected = buildSecureHash({
      orderId: payload.orderid,
      apTransactionId: payload.ap_transactionid,
      amount: payload.amount,
      transactionStatus: payload.transaction_status,
      message: payload.message,
      merchantId: creds.merchantId,
      username: creds.username,
      // UPI responses fold the payer VPA into the hash.
      customerVpa: String(payload.chmod).toLowerCase() === 'upi' ? payload.customer_vpa : undefined,
    });

    const ok = secureHashMatches(expected, received);
    if (!ok) {
      this.logger.warn(`Airpay secure hash mismatch for order ${payload.orderid}`);
    }
    return ok;
  }

  /** Airpay signals success with transaction_status 200. */
  isSuccessful(payload: Record<string, any>): boolean {
    return Number(payload?.transaction_status) === 200;
  }
}
