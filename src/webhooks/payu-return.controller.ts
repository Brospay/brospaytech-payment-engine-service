import { Controller, Post, Get, Body, Res, Logger, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiExcludeEndpoint } from '@nestjs/swagger';
import { Response } from 'express';
import { Public } from '@/common/guards/combined-auth.guard';
import { PayUClient } from '@/adapters/tsp-adapters/payu/payu.client';


@ApiTags('PayU')
@Controller('payu')
@Public()
export class PayUReturnController {
  private readonly logger = new Logger(PayUReturnController.name);

  private client(): PayUClient | null {
    const key = process.env.PAYU_MERCHANT_KEY;
    const salt = process.env.PAYU_MERCHANT_SALT;
    if (!key || !salt) {
      this.logger.error('PAYU_MERCHANT_KEY / PAYU_MERCHANT_SALT are not configured');
      return null;
    }
    return new PayUClient({
      key,
      salt,
      production: process.env.PAYU_MODE === 'production',
    });
  }

  private resultPage(outcome: 'success' | 'failure' | 'cancel', params: Record<string, string | undefined>) {
    const base = process.env.PAYU_RESULT_PAGE_BASE || 'https://pay.brospayx.com/payment';
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
    return `${base}/${outcome}${qs.toString() ? `?${qs}` : ''}`;
  }


  @Post('return/success')
  @ApiOperation({ summary: 'PayU success return (browser form POST)' })
  async success(@Body() body: any, @Res() res: Response) {
    return this.handleReturn(body, res, 'success');
  }

  /** Failure URL (furl). */
  @Post('return/failure')
  @ApiOperation({ summary: 'PayU failure return (browser form POST)' })
  async failure(@Body() body: any, @Res() res: Response) {
    return this.handleReturn(body, res, 'failure');
  }

  private async handleReturn(
    body: any,
    res: Response,
    expected: 'success' | 'failure',
  ) {
    const txnid = body?.txnid;
    const client = this.client();

    if (!client) {
      return res.redirect(303, this.resultPage('failure', { message: 'Gateway not configured' }));
    }

    // 1. The hash proves the post really came from PayU and was not altered.
    const hashOk = client.verifyCallback(body);
    if (!hashOk) {
      this.logger.warn(`PayU return with invalid hash for txnid=${txnid}`);
      return res.redirect(303, this.resultPage('failure', {
        orderid: txnid,
        message: 'Payment could not be verified',
      }));
    }

    // 2. Confirm with PayU directly. The browser post can be replayed or the
    //    customer can close the tab, so the server decides the real outcome.
    let confirmed = String(body?.status ?? '').toLowerCase();
    try {
      const verified = await client.verifyPayment(txnid);
      confirmed = verified.status;
      this.logger.log(`PayU txnid=${txnid} posted=${body?.status} verified=${verified.status}`);
    } catch (err: any) {
      this.logger.error(`PayU verify failed for txnid=${txnid}: ${err.message}`);
    }

    const outcome = confirmed === 'success' ? 'success' : 'failure';
    if (outcome !== expected) {
      this.logger.warn(`PayU txnid=${txnid} returned on /${expected} but verified as ${confirmed}`);
    }

    return res.redirect(303, this.resultPage(outcome, {
      orderid: txnid,
      amount: body?.amount,
      transaction_id: body?.mihpayid,
      message: outcome === 'success' ? undefined : body?.error_Message ?? body?.field9,
    }));
  }


  @Post('webhook')
  @ApiOperation({ summary: 'PayU server-to-server webhook' })
  async webhook(@Body() body: any) {
    const client = this.client();
    if (!client) return { success: false, message: 'Gateway not configured' };

    const txnid = body?.txnid;
    if (!client.verifyCallback(body)) {
      this.logger.warn(`PayU webhook rejected: invalid hash for txnid=${txnid}`);
      // 200 with success:false - retrying will not fix a bad signature.
      return { success: false, message: 'Invalid signature' };
    }

    let status = String(body?.status ?? '').toLowerCase();
    try {
      status = (await client.verifyPayment(txnid)).status;
    } catch (err: any) {
      this.logger.error(`PayU webhook verify failed for txnid=${txnid}: ${err.message}`);
    }

    this.logger.log(`PayU webhook txnid=${txnid} status=${status}`);
    return { success: true, txnid, status };
  }

  /** Lets us confirm the endpoint is reachable without sending a payment. */
  @Get('health')
  @ApiExcludeEndpoint()
  health(@Query('echo') echo?: string) {
    return {
      ok: true,
      configured: Boolean(process.env.PAYU_MERCHANT_KEY && process.env.PAYU_MERCHANT_SALT),
      mode: process.env.PAYU_MODE ?? 'test',
      echo,
    };
  }
}
