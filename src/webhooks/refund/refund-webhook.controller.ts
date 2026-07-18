import { Controller, Post, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { RefundService } from '@/modules/refund/refund.service';
import { LoggerService } from '@/common/services/logger.service';

@Controller('webhooks/tsp/refund')
@ApiTags('tsp-webhooks')
export class RefundWebhookController {
  constructor(
    private readonly refundService: RefundService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Razorpay refund webhook
   */
  @Post('razorpay')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Razorpay refund webhook',
    description: 'Receives refund status updates from Razorpay'
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  async razorpayRefundWebhook(@Body() payload: any) {
    this.logger.log('Razorpay refund webhook received', JSON.stringify(payload));

    try {
      const event = payload.event;
      const refundData = payload.payload?.refund?.entity;

      if (event === 'refund.processed' && refundData) {
        const refundId = this.extractRefundIdFromNotes(refundData.notes);

        if (refundId) {
          await this.refundService.handleTSPWebhook(refundId, {
            status: refundData.status === 'processed' ? 'completed' : 'failed',
            externalRefundId: refundData.id,
            tspResponse: refundData
          });
        }
      }

      return { success: true, message: 'Webhook received' };
    } catch (error) {
      this.logger.error('Razorpay refund webhook error:', error.stack);
      return { success: false, message: error.message };
    }
  }

  /**
   * Stripe refund webhook
   */
  @Post('stripe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Stripe refund webhook',
    description: 'Receives refund status updates from Stripe'
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  async stripeRefundWebhook(@Body() payload: any) {
    this.logger.log('Stripe refund webhook received', JSON.stringify(payload));

    try {
      const event = payload.type;
      const refundData = payload.data?.object;

      if (event === 'charge.refunded' && refundData) {
        const refundId = refundData.metadata?.refund_id;

        if (refundId) {
          await this.refundService.handleTSPWebhook(refundId, {
            status: refundData.status === 'succeeded' ? 'completed' : 'failed',
            externalRefundId: refundData.id,
            tspResponse: refundData
          });
        }
      }

      return { success: true, message: 'Webhook received' };
    } catch (error) {
      this.logger.error('Stripe refund webhook error:', error.stack);
      return { success: false, message: error.message };
    }
  }

  /**
   * Kingdom Bank refund webhook
   */
  @Post('kingdom-bank')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Kingdom Bank refund webhook',
    description: 'Receives refund status updates from Kingdom Bank'
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  async kingdomBankRefundWebhook(@Body() payload: any) {
    this.logger.log('Kingdom Bank refund webhook received', JSON.stringify(payload));

    try {
      const refundId = payload.merchantRefundId || payload.refundForeignTransactionId;
      const status = payload.transactionStatus;

      if (refundId) {
        await this.refundService.handleTSPWebhook(refundId, {
          status: status === 'COMPLETED' || status === 'SUCCESS' ? 'completed' : 'failed',
          externalRefundId: payload.transactionId,
          failureReason: payload.statusDescription,
          tspResponse: payload
        });
      }

      return { success: true, message: 'Webhook received' };
    } catch (error) {
      this.logger.error('Kingdom Bank refund webhook error:', error.stack);
      return { success: false, message: error.message };
    }
  }

  /**
   * Paytara refund webhook
   */
  @Post('paytara')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ 
    summary: 'Paytara refund webhook',
    description: 'Receives refund status updates from Paytara'
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  async paytaraRefundWebhook(@Body() payload: any) {
    this.logger.log('Paytara refund webhook received', JSON.stringify(payload));

    try {
      const refundId = payload.merchant_refund_id;
      const status = payload.status;

      if (refundId) {
        await this.refundService.handleTSPWebhook(refundId, {
          status: status === 'success' || status === 'completed' ? 'completed' : 'failed',
          externalRefundId: payload.refund_id,
          failureReason: payload.message,
          tspResponse: payload
        });
      }

      return { success: true, message: 'Webhook received' };
    } catch (error) {
      this.logger.error('Paytara refund webhook error:', error.stack);
      return { success: false, message: error.message };
    }
  }

  private extractRefundIdFromNotes(notes: any): string | null {
    if (typeof notes === 'object' && notes.refund_id) {
      return notes.refund_id;
    }
    if (typeof notes === 'string') {
      const match = notes.match(/refund_[a-z0-9_]+/i);
      return match ? match[0] : null;
    }
    return null;
  }
}

