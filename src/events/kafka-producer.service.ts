import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kafka, Producer, ProducerRecord } from 'kafkajs';
import { TransactionEvent, PaymentStatusEvent, PayoutEvent, RefundEvent } from './types/event.types';

@Injectable()
export class KafkaProducerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(KafkaProducerService.name);
  private kafka: Kafka | null = null;
  private producer: Producer | null = null;
  private isConnected = false;
  private readonly isEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.isEnabled = this.configService.get<string>('KAFKA_ENABLED', 'false') === 'true';
  }

  async onModuleInit(): Promise<void> {
    if (!this.isEnabled) {
      this.logger.warn('Kafka is disabled. Set KAFKA_ENABLED=true to enable event streaming.');
      return;
    }

    try {
      const brokers = this.configService.get<string>('KAFKA_BROKERS', 'localhost:9092').split(',');
      const clientId = this.configService.get<string>('KAFKA_CLIENT_ID', 'payment-engine-producer');

      this.kafka = new Kafka({
        clientId,
        brokers,
        retry: {
          initialRetryTime: 100,
          retries: 8
        }
      });

      this.producer = this.kafka.producer({
        allowAutoTopicCreation: true,
        transactionTimeout: 30000,
        maxInFlightRequests: 5,
        idempotent: true,
      });

      await this.producer.connect();
      this.isConnected = true;
      this.logger.log('Kafka producer connected successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize Kafka producer: ${error.message}`);
      if (this.configService.get('NODE_ENV') === 'production') {
        throw error;
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.producer && this.isConnected) {
      await this.producer.disconnect();
      this.logger.log('Kafka producer disconnected');
    }
  }

  async publishTransactionEvent(event: TransactionEvent): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Kafka not connected, skipping transaction event');
      return;
    }

    try {
      const message: ProducerRecord = {
        topic: 'payment-engine.transactions',
        messages: [{
          key: event.transactionId,
          value: JSON.stringify(event),
          timestamp: Date.now().toString(),
        }],
      };

      await this.producer.send(message);
      this.logger.log(`✅ Kafka: Transaction event published: ${event.transactionId}`);
    } catch (error) {
      this.logger.error(`Failed to publish transaction event: ${error.message}`);
    }
  }

  async publishPaymentStatusEvent(event: PaymentStatusEvent): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Kafka not connected, skipping payment status event');
      return;
    }

    try {
      const message: ProducerRecord = {
        topic: 'payment-engine.payments',
        messages: [{
          key: event.transactionId,
          value: JSON.stringify(event),
          timestamp: Date.now().toString(),
        }],
      };

      await this.producer.send(message);
      this.logger.log(`Kafka: Payment status event published: ${event.transactionId}`);
    } catch (error) {
      this.logger.error(`Failed to publish payment status event: ${error.message}`);
    }
  }

  async publishBatch(events: (TransactionEvent | PaymentStatusEvent)[]): Promise<void> {
    if (!this.isConnected || events.length === 0) {
      return;
    }

    try {
      const transactionEvents = events.filter(e => e.eventType.startsWith('transaction.'));
      const paymentEvents = events.filter(e => e.eventType.startsWith('payment.'));

      const promises: Promise<void>[] = [];

      if (transactionEvents.length > 0) {
        promises.push(this.publishTransactionBatch(transactionEvents as TransactionEvent[]));
      }

      if (paymentEvents.length > 0) {
        promises.push(this.publishPaymentBatch(paymentEvents as PaymentStatusEvent[]));
      }

      await Promise.all(promises);
    } catch (error) {
      this.logger.error(`Failed to publish batch events: ${error.message}`);
    }
  }

  private async publishTransactionBatch(events: TransactionEvent[]): Promise<void> {
    const messages = events.map(event => ({
      key: event.transactionId,
      value: JSON.stringify(event),
      timestamp: Date.now().toString(),
    }));

    await this.producer.send({
      topic: 'payment-engine.transactions',
      messages,
    });
  }

  private async publishPaymentBatch(events: PaymentStatusEvent[]): Promise<void> {
    const messages = events.map(event => ({
      key: event.transactionId,
      value: JSON.stringify(event),
      timestamp: Date.now().toString(),
    }));

    await this.producer.send({
      topic: 'payment-engine.payments',
      messages,
    });
  }

  async publishPayoutEvent(event: PayoutEvent): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Kafka not connected, skipping payout event');
      return;
    }

    try {
      const message: ProducerRecord = {
        topic: 'payment-engine.payouts',
        messages: [{
          key: event.payoutId,
          value: JSON.stringify(event),
          timestamp: Date.now().toString(),
        }],
      };

      await this.producer.send(message);
      this.logger.log(`✅ Kafka: Payout event published: ${event.payoutId}`);
    } catch (error) {
      this.logger.error(`Failed to publish payout event: ${error.message}`);
    }
  }

  async publishRefundEvent(event: RefundEvent): Promise<void> {
    if (!this.isConnected) {
      this.logger.warn('Kafka not connected, skipping refund event');
      return;
    }

    try {
      const message: ProducerRecord = {
        topic: 'payment-engine.refunds',
        messages: [{
          key: event.refundId,
          value: JSON.stringify(event),
          timestamp: Date.now().toString(),
        }],
      };

      await this.producer.send(message);
      this.logger.log(`✅ Kafka: Refund event published: ${event.refundId}`);
    } catch (error) {
      this.logger.error(`Failed to publish refund event: ${error.message}`);
    }
  }

  isKafkaEnabled(): boolean {
    return this.isEnabled && this.isConnected;
  }
}

