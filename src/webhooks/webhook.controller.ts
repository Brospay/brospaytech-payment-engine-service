import { Controller, Post, Body, Headers, Param, Req, UseInterceptors } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { Public } from '@/common/guards/combined-auth.guard';
import { WebhookService } from './webhook.service';
import { KingdomBankWebhookNotificationDto, KingdomBankWebhookResponseDto } from '@/dto/webhooks/kingdom-bank-webhook.dto';
import { Request } from 'express';
type RawRequest = Request & { rawBody?: Buffer };

@ApiTags('Webhooks')
@Controller('webhooks')
@Public()
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Razorpay Webhook Handler
   */
  @Post('razorpay')
  async handleRazorpayWebhook(
    @Body() payload: any,
    @Headers('x-razorpay-signature') signature: string
  ) {
    try {
      const result = await this.webhookService.processRazorpayWebhook(payload, signature);
      
      return {
        success: true,
        message: 'Webhook processed successfully',
        transactionId: result.transactionId,
        status: result.status,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Webhook processing failed',
        message: error.message,
      };
    }
  }

  /**
   * Paytara Webhook Handler
   */
  @Post('paytara')
  async handlePaytaraWebhook(
    @Body() payload: any,
    @Headers('x-paytara-hash') hash: string
  ) {
    try {
      const result = await this.webhookService.processPaytaraWebhook(payload, hash);
      
      return {
        success: true,
        message: 'Webhook processed successfully',
        transactionId: result.transactionId,
        status: result.status,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Webhook processing failed',
        message: error.message,
      };
    }
  }

  /**
   * Stripe Webhook Handler
   */
  @Post('stripe')
  async handleStripeWebhook(
    @Body() payload: any,
    @Headers('stripe-signature') signature: string
  ) {
    try {
      const result = await this.webhookService.processStripeWebhook(payload, signature);
      
      return {
        success: true,
        message: 'Webhook processed successfully',
        transactionId: result.transactionId,
        status: result.status,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Webhook processing failed',
        message: error.message,
      };
    }
  }

  /**
   * Payaza Webhook Handler
   */
  @Post('payaza')
  @ApiOperation({ 
    summary: 'Handle Payaza webhook notifications',
    description: 'Process payment, transfer, refund, and chargeback status updates from Payaza'
  })
  async handlePayazaWebhook(
    @Body() payload: any,
    @Headers('x-payaza-signature') signature: string,
    @Req() req: RawRequest
  ) {
    try {
      console.log('Payaza webhook received', payload);
      let enrichedPayload: any = typeof payload === 'object' && payload !== null ? { ...payload } : payload;

      if (req?.rawBody) {
        enrichedPayload.rawBody = req.rawBody instanceof Buffer ? req.rawBody : Buffer.from(req.rawBody);
      }

      const result = await this.webhookService.processPayazaWebhook(enrichedPayload, signature);
      
      return {
        success: true,
        message: 'Webhook processed successfully',
        transactionId: result.transactionId,
        status: result.status,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Webhook processing failed',
        message: error.message,
      };
    }
  }

  /**
   * Payout Webhook Handler (for Kingdom Bank & Paytara payouts)
   */
  @Post('payout/:tspProvider')
  @ApiOperation({ 
    summary: 'Handle payout webhook notifications',
    description: 'Process payout status updates from TSPs (Paytara, Kingdom Bank) with auto-refund on failure'
  })
  async handlePayoutWebhook(
    @Param('tspProvider') tspProvider: string,
    @Body() payload: any,
    @Headers('x-signature') signature: string,
    @Headers('x-signature-key-id') signatureKeyId: string
  ) {
    try {
      const result = await this.webhookService.processPayoutWebhook(
        tspProvider,
        payload,
        signature,
        signatureKeyId
      );
      
      return {
        success: true,
        message: 'Payout webhook processed successfully',
        payoutId: result.payoutId,
        status: result.status,
        refunded: result.refunded || false,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Payout webhook processing failed',
        message: error.message,
      };
    }
  }


  /**
   * Kingdom Bank Webhook Handler
   * Handles multiple transaction types: PAYMENT, PAYOUT, EXTERNAL_TRANSFER, REFUND, etc.
   */
  @Post('kingdom-bank')
  @ApiOperation({ 
    summary: 'Handle Kingdom Bank webhook notifications',
    description: 'Process Kingdom Bank notifications for payments, payouts, transfers, refunds, and other transaction events. Routes to appropriate handler based on transaction type.'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook processed successfully',
    type: KingdomBankWebhookResponseDto
  })
  @ApiResponse({ 
    status: 400, 
    description: 'Invalid webhook payload or signature'
  })
  async handleKingdomBankWebhook(
    @Body() payload: KingdomBankWebhookNotificationDto,
    @Headers('x-signature') signature: string,
    @Headers('x-signature-key-id') signatureKeyId: string
  ): Promise<KingdomBankWebhookResponseDto> {
    try {
      const result = await this.webhookService.processKingdomBankWebhook(
        payload,
        signature,
        signatureKeyId
      );
      
      return {
        success: true,
        message: 'Kingdom Bank webhook processed successfully',
        transactionId: result.transactionId,
        status: result.status,
        updated: result.updated,
      };
    } catch (error) {
      return {
        success: false,
        message: `Kingdom Bank webhook processing failed: ${error.message}`,
        transactionId: payload.foreignTransactionId,
        updated: false,
      };
    }
  }

  /**
   * Sulifu Pay Webhook Handler
   * Handles deposit and payout notifications
   */
  @Post('sulifu-pay')
  @UseInterceptors(FileFieldsInterceptor([]))
  @ApiOperation({ 
    summary: 'Handle Sulifu Pay webhook notifications',
    description: 'Process Sulifu Pay async notifications for deposits and payouts (accepts multipart/form-data)'
  })
  @ApiResponse({ 
    status: 200, 
    description: 'Webhook processed successfully - return "SUCCESS"',
  })
  async handleSulifuPayWebhook(
    @Body() payload: any,
    @Req() req: Request
  ): Promise<string> {
    
    try {
      console.log('Sulifu Pay webhook received', payload);
      if (!payload || Object.keys(payload).length === 0) {
        console.log('Sulifu Pay webhook received is empty');
        return 'SUCCESS';
      }
      const result = await this.webhookService.processSulifuPayWebhook(payload);

      return 'SUCCESS';
    } catch (error) {
      return 'SUCCESS';
    }
  }
  
  /**
   * Generic webhook handler for testing
   */
  @Post(':provider')
  async handleGenericWebhook(
    @Param('provider') provider: string,
    @Body() payload: any,
    @Headers() headers: Record<string, string>
  ) {
    try {
      const result = await this.webhookService.processGenericWebhook(provider, payload, headers);
      
      return {
        success: true,
        message: 'Webhook processed successfully',
        provider,
        result,
      };
    } catch (error) {
      return {
        success: false,
        error: 'Webhook processing failed',
        message: error.message,
        provider,
      };
    }
  }

}
