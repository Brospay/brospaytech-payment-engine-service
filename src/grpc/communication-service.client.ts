import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientGrpc } from '@nestjs/microservices';
import { Observable } from 'rxjs';
import { take } from 'rxjs/operators';
import { join } from 'path';

import { 
  CommunicationServiceGrpc,
  CreateWebhookDeliveryRequest,
  CreateWebhookDeliveryResponse,
  SendNotificationRequest,
  SendNotificationResponse,
  BroadcastEventRequest,
  BroadcastEventResponse,
  CreateAlertRequest,
  CreateAlertResponse,
  PaymentNotificationData,
  WebhookDeliveryData,
  PaymentEngineAlert,
  HealthCheckRequest,
  HealthCheckResponse
} from '../types/grpc/communication-service.types';

/**
 * Communication Service gRPC Client for Payment Engine
 * 
 * Responsibilities:
 * - Webhook delivery to merchant endpoints
 * - Payment notification sending (email, SMS, push)
 * - Real-time event broadcasting for merchant dashboards
 * - System alert creation for payment failures and anomalies
 * 
 * Critical for:
 * - Merchant webhook compliance (payment confirmations)
 * - Customer notifications (payment receipts, failures)
 * - System monitoring (TSP downtime, high decline rates)
 */
@Injectable()
export class CommunicationServiceClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CommunicationServiceClient.name);
  private communicationService: CommunicationServiceGrpc;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 5;
  private readonly baseRetryDelay = 1000; // 1 second

  constructor(
    @Inject('COMMUNICATION_SERVICE') private readonly client: ClientGrpc,
    private readonly configService: ConfigService
  ) {}

  async onModuleInit() {
    await this.initializeConnection();
  }

  async onModuleDestroy() {
    this.isConnected = false;
    this.logger.log('Communication Service gRPC client disconnected');
  }

  private async initializeConnection(): Promise<void> {
    try {
      this.communicationService = this.client.getService<CommunicationServiceGrpc>('CommunicationService');
      
      // Test connection with health check
      await this.testConnection();
      
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.logger.log('✅ Communication Service gRPC client connected successfully');
      
    } catch (error) {
      this.logger.error(`❌ Failed to connect to Communication Service: ${error.message}`);
      await this.handleConnectionFailure();
    }
  }

  private async testConnection(): Promise<void> {
    try {
      const healthCheckRequest: HealthCheckRequest = {
        service: 'payment-engine'
      };

      const result = await this.communicationService.healthCheck(healthCheckRequest).pipe(take(1)).toPromise();

      if (!result?.healthy) {
        throw new Error(`Communication Service is not healthy: ${result?.status || 'unknown'}`);
      }
    } catch (error) {
      throw new Error(`Health check failed: ${error.message}`);
    }
  }

  private async handleConnectionFailure(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.logger.error(`❌ Max reconnection attempts (${this.maxReconnectAttempts}) reached for Communication Service`);
      return;
    }

    this.reconnectAttempts++;
    const delay = this.baseRetryDelay * Math.pow(2, this.reconnectAttempts - 1); // Exponential backoff

    this.logger.warn(`🔄 Retrying Communication Service connection in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);

    setTimeout(async () => {
      await this.initializeConnection();
    }, delay);
  }

  /**
   * Create webhook delivery for merchant endpoint
   * Called after payment completion/failure to notify merchant
   */
  async createWebhookDelivery(data: WebhookDeliveryData): Promise<CreateWebhookDeliveryResponse | null> {
    if (!this.isConnected) {
      this.logger.error('Communication Service not connected - cannot create webhook delivery');
      return null;
    }

    try {
      const request: CreateWebhookDeliveryRequest = {
        webhook_event_id: `pe_${data.payment_data.payment_id}_${Date.now()}`,
        merchant_id: data.payment_data.merchant_id,
        webhook_url: data.merchant_webhook_url,
        payload: JSON.stringify({
          event_type: data.event_type,
          payment_id: data.payment_data.payment_id,
          transaction_id: data.payment_data.transaction_id,
          amount: data.payment_data.amount,
          currency: data.payment_data.currency,
          status: data.payment_data.status,
          payment_method: data.payment_data.payment_method,
          order_id: data.payment_data.order_id,
          processed_at: data.payment_data.processed_at,
          failure_reason: data.payment_data.failure_reason,
        }),
        priority: data.payment_data.status === 'failed' ? 'high' : 'normal',
      };

      const result = await this.communicationService.createWebhookDelivery(request).pipe(take(1)).toPromise();

      if (result?.success) {
        this.logger.log(`✅ Webhook delivery created: ${result.delivery_id} for merchant ${data.payment_data.merchant_id}`);
      }

      return result || null;
    } catch (error) {
      this.logger.error(`Failed to create webhook delivery: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Send payment notification to customer
   * Called for payment confirmations, failures, receipts
   */
  async sendPaymentNotification(
    channel: 'email' | 'sms' | 'push',
    notificationType: 'payment_success' | 'payment_failure' | 'payment_receipt',
    paymentData: PaymentNotificationData,
    templateVariables?: Record<string, any>
  ): Promise<SendNotificationResponse | null> {
    if (!this.isConnected) {
      this.logger.error('Communication Service not connected - cannot send notification');
      return null;
    }

    try {
      const recipientContact = channel === 'email' ? paymentData.customer_email : paymentData.customer_phone;
      
      if (!recipientContact) {
        this.logger.warn(`No ${channel} contact available for customer notification`);
        return null;
      }

      const request: SendNotificationRequest = {
        channel,
        type: notificationType,
        recipient_id: paymentData.payment_id,
        recipient_contact: recipientContact,
        subject: this.generateNotificationSubject(notificationType, paymentData),
        message: this.generateNotificationMessage(notificationType, paymentData),
        template_id: `payment_engine_${notificationType}_${channel}`,
        template_variables: JSON.stringify({
          ...paymentData,
          ...templateVariables,
          formatted_amount: `${paymentData.currency} ${(typeof paymentData.amount === 'string' ? parseFloat(paymentData.amount) : paymentData.amount).toFixed(2)}`,
        }),
        priority: paymentData.status === 'failed' ? 'high' : 'normal',
      };

      const result = await this.communicationService.sendNotification(request).pipe(take(1)).toPromise();

      if (result?.success) {
        this.logger.log(`✅ ${channel} notification sent: ${result.notification_id} for payment ${paymentData.payment_id}`);
      }

      return result || null;
    } catch (error) {
      this.logger.error(`Failed to send payment notification: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Broadcast real-time event to merchant dashboard
   * Called for payment status updates, balance changes
   */
  async broadcastPaymentEvent(
    eventType: 'payment_updated' | 'payment_completed' | 'payment_failed',
    merchantId: string,
    paymentData: PaymentNotificationData
  ): Promise<BroadcastEventResponse | null> {
    if (!this.isConnected) {
      this.logger.error('Communication Service not connected - cannot broadcast event');
      return null;
    }

    try {
      const request: BroadcastEventRequest = {
        event_type: eventType,
        channel: 'merchant_dashboard',
        recipient_id: merchantId,
        room: `merchant_${merchantId}`,
        payload: JSON.stringify({
          payment_id: paymentData.payment_id,
          transaction_id: paymentData.transaction_id,
          amount: paymentData.amount,
          currency: paymentData.currency,
          status: paymentData.status,
          payment_method: paymentData.payment_method,
          order_id: paymentData.order_id,
          processed_at: paymentData.processed_at,
          failure_reason: paymentData.failure_reason,
        }),
        priority: 'normal',
      };

      const result = await this.communicationService.broadcastEvent(request).pipe(take(1)).toPromise();

      if (result?.success) {
        this.logger.log(`✅ Payment event broadcasted: ${result.event_id} to ${result.subscribers_count} subscribers`);
      }

      return result || null;
    } catch (error) {
      this.logger.error(`Failed to broadcast payment event: ${error.message}`, error.stack);
      return null;
    }
  }

  /**
   * Create system alert for critical payment issues
   * Called for TSP failures, high decline rates, fraud detection
   */
  async createPaymentAlert(alertData: PaymentEngineAlert): Promise<CreateAlertResponse | null> {
    if (!this.isConnected) {
      this.logger.error('Communication Service not connected - cannot create alert');
      return null;
    }

    try {
      const request: CreateAlertRequest = {
        alert_type: alertData.type,
        severity: alertData.severity,
        title: this.generateAlertTitle(alertData),
        description: this.generateAlertDescription(alertData),
        merchant_id: alertData.merchant_id,
        source: 'payment-engine',
        source_id: alertData.transaction_id || alertData.tsp_name || 'system',
        payload: JSON.stringify(alertData.error_details),
      };

      const result = await this.communicationService.createAlert(request).pipe(take(1)).toPromise();

      if (result?.success) {
        this.logger.log(`✅ Alert created: ${result.alert_id} for ${alertData.type}`);
      }

      return result || null;
    } catch (error) {
      this.logger.error(`Failed to create payment alert: ${error.message}`, error.stack);
      return null;
    }
  }

  // Helper methods
  private generateNotificationSubject(type: string, paymentData: PaymentNotificationData): string {
    switch (type) {
      case 'payment_success':
        return `Payment Confirmation - ${paymentData.currency} ${paymentData.amount}`;
      case 'payment_failure':
        return `Payment Failed - ${paymentData.currency} ${paymentData.amount}`;
      case 'payment_receipt':
        return `Payment Receipt - Order ${paymentData.order_id}`;
      default:
        return 'Payment Update';
    }
  }

  private generateNotificationMessage(type: string, paymentData: PaymentNotificationData): string {
    const amountValue = typeof paymentData.amount === 'string' 
      ? parseFloat(paymentData.amount) 
      : paymentData.amount;
    const amount = `${paymentData.currency} ${amountValue.toFixed(2)}`;
    
    switch (type) {
      case 'payment_success':
        return `Your payment of ${amount} has been processed successfully. Transaction ID: ${paymentData.transaction_id}`;
      case 'payment_failure':
        return `Your payment of ${amount} could not be processed. ${paymentData.failure_reason || 'Please try again.'}`;
      case 'payment_receipt':
        return `Payment receipt for your order ${paymentData.order_id}. Amount: ${amount}. Transaction ID: ${paymentData.transaction_id}`;
      default:
        return 'Payment status update';
    }
  }

  private generateAlertTitle(alertData: PaymentEngineAlert): string {
    switch (alertData.type) {
      case 'payment_failure':
        return `High Payment Failure Rate Detected`;
      case 'high_decline_rate':
        return `Unusual Decline Rate Alert`;
      case 'tsp_downtime':
        return `TSP Service Downtime: ${alertData.tsp_name}`;
      case 'fraud_detected':
        return `Potential Fraud Activity Detected`;
      case 'system_error':
        return `Payment Engine System Error`;
      default:
        return 'Payment System Alert';
    }
  }

  private generateAlertDescription(alertData: PaymentEngineAlert): string {
    switch (alertData.type) {
      case 'payment_failure':
        return `Multiple payment failures detected for merchant ${alertData.merchant_id}. Immediate attention required.`;
      case 'high_decline_rate':
        return `Decline rate exceeding normal thresholds. Review payment routing and merchant configuration.`;
      case 'tsp_downtime':
        return `TSP ${alertData.tsp_name} is experiencing connectivity issues. Payments may be affected.`;
      case 'fraud_detected':
        return `Suspicious payment activity detected. Transaction ${alertData.transaction_id} flagged for review.`;
      case 'system_error':
        return `Critical system error in payment processing. Technical investigation required.`;
      default:
        return 'Alert from Payment Engine requiring attention.';
    }
  }

  // Connection status check
  isServiceConnected(): boolean {
    return this.isConnected;
  }
}
