import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { RefundService } from './refund.service';
import { LoggerService } from '@/common/services/logger.service';

@Injectable()
export class RefundCronService {
  constructor(
    private readonly refundService: RefundService,
    private readonly logger: LoggerService,
  ) {}

  /**
   * Auto-cancel refunds that are pending approval beyond T+2 days
   * Runs every hour
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredRefunds() {
    this.logger.log('Running auto-cancel expired refunds cron job');

    try {
      const cancelledCount = await this.refundService.autoCancelExpiredRefunds();
      
      if (cancelledCount > 0) {
        this.logger.log(`Auto-cancelled ${cancelledCount} expired refunds`);
      }
    } catch (error) {
      this.logger.error('Error in auto-cancel refunds cron job:', error.stack);
    }
  }
}

