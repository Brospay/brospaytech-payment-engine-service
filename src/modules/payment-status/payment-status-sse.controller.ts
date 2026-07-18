import { Controller, Sse, Param, MessageEvent, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';
import { Observable, interval, map, filter, switchMap, takeWhile } from 'rxjs';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentIntent } from '@/entities/payment-intent.entity';
import { PaymentTransaction } from '@/entities/payment-transaction.entity';
import { Public } from '@/common/guards/combined-auth.guard';

@Controller('payment-status')
@ApiTags('public')
export class PaymentStatusSSEController {
  private readonly logger = new Logger(PaymentStatusSSEController.name);

  constructor(
    @InjectRepository(PaymentIntent)
    private readonly paymentIntentRepo: Repository<PaymentIntent>,
    
    @InjectRepository(PaymentTransaction)
    private readonly transactionRepo: Repository<PaymentTransaction>,
  ) {}

  @Sse(':intentId')
  @Public()
  @ApiOperation({
    summary: 'Stream payment status updates (Public)',
    description: 'Server-Sent Events endpoint for real-time payment status updates. No authentication required - used by payment pages.'
  })
  @ApiParam({
    name: 'intentId',
    description: 'Payment intent ID to monitor',
    example: 'pi_1234567890'
  })
  @ApiResponse({
    status: 200,
    description: 'SSE stream established successfully'
  })
  streamPaymentStatus(@Param('intentId') intentId: string): Observable<MessageEvent> {
    // this.logger.log(`SSE stream started for payment intent: ${intentId}`);

    return interval(2000).pipe(
      switchMap(async () => {
        const intent = await this.paymentIntentRepo.findOne({
          where: { intentId },
        });

        if (!intent) {
          return {
            status: 'not_found',
            message: 'Payment intent not found',
          };
        }

        const transaction = await this.transactionRepo.findOne({
          where: { paymentIntentId: intentId },
          order: { createdAt: 'DESC' },
        });

        return {
          intentId: intent.intentId,
          status: intent.status,
          amount: intent.amount,
          currency: intent.currency,
          transactionId: transaction?.transactionId,
          externalTransactionId: transaction?.externalTransactionId,
          tspProvider: transaction?.tspProvider,
          errorMessage: transaction?.errorMessage,
          timestamp: new Date().toISOString(),
        };
      }),
      takeWhile((data) => {
        const terminalStatuses = ['completed', 'succeeded', 'failed', 'cancelled', 'expired', 'not_found'];
        return !terminalStatuses.includes(data.status);
      }, true),
      map((data) => {
        // this.logger.debug(`Sending SSE update for ${intentId}: ${data.status}`);
        return {
          data,
          type: 'payment-status-update',
        } as MessageEvent;
      }),
    );
  }
}
