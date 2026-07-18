import { Controller, Post, Body, Headers, Logger, HttpCode, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiHeader } from '@nestjs/swagger';
import { SettlementWebhookService } from './settlement-webhook.service';

@Controller('webhooks/settlement')
@ApiTags('webhooks')
export class SettlementWebhookController {
  private readonly logger = new Logger(SettlementWebhookController.name);

  constructor(
    private readonly settlementWebhookService: SettlementWebhookService
  ) {}

  @Post('paytara')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Paytara settlement webhook',
    description: 'Receives settlement status updates from Paytara TSP'
  })
  @ApiHeader({
    name: 'x-paytara-signature',
    description: 'HMAC signature for webhook verification',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid webhook signature'
  })
  async handlePaytaraWebhook(
    @Body() payload: any,
    @Headers('x-paytara-signature') signature: string
  ) {
    this.logger.log('Received Paytara settlement webhook', {
      referenceId: payload.merchantReference || payload.referenceId,
      status: payload.status
    });

    return this.settlementWebhookService.handlePaytaraWebhook(payload, signature);
  }

  @Post('kingdom-bank')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Kingdom Bank settlement webhook',
    description: 'Receives settlement status updates from Kingdom Bank TSP'
  })
  @ApiHeader({
    name: 'x-kingdom-signature',
    description: 'HMAC signature for webhook verification',
    required: true
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid webhook signature'
  })
  async handleKingdomBankWebhook(
    @Body() payload: any,
    @Headers('x-kingdom-signature') signature: string
  ) {
    this.logger.log('Received Kingdom Bank settlement webhook', {
      referenceId: payload.referenceId,
      status: payload.status
    });

    return this.settlementWebhookService.handleKingdomBankWebhook(payload, signature);
  }

  @Post(':tspProvider')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Generic TSP settlement webhook',
    description: 'Generic webhook handler for other TSP providers'
  })
  @ApiParam({
    name: 'tspProvider',
    description: 'TSP provider name (e.g., razorpay, stripe)',
    example: 'razorpay'
  })
  @ApiResponse({
    status: 200,
    description: 'Webhook processed successfully'
  })
  async handleGenericWebhook(
    @Param('tspProvider') tspProvider: string,
    @Body() payload: any,
    @Headers('x-signature') signature: string
  ) {
    this.logger.log(`Received ${tspProvider} settlement webhook`, {
      tspProvider,
      payload
    });

    return {
      success: true,
      message: `Webhook for ${tspProvider} received`,
      note: 'Generic handler - implement specific logic for this TSP'
    };
  }
}

