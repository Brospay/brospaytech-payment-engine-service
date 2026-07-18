/**
 * Communication Service gRPC client types for Payment Engine
 * Provides webhook delivery, notifications, and alerts
 */

import { Observable } from 'rxjs';

// Service interface
export interface CommunicationServiceGrpc {
  // Webhook operations
  createWebhookDelivery(request: CreateWebhookDeliveryRequest): Observable<CreateWebhookDeliveryResponse>;
  getWebhookStatus(request: GetWebhookStatusRequest): Observable<GetWebhookStatusResponse>;
  
  // Notification operations
  sendNotification(request: SendNotificationRequest): Observable<SendNotificationResponse>;
  sendBulkNotifications(request: SendBulkNotificationsRequest): Observable<SendBulkNotificationsResponse>;
  getNotificationStatus(request: GetNotificationStatusRequest): Observable<GetNotificationStatusResponse>;
  
  // Event streaming
  broadcastEvent(request: BroadcastEventRequest): Observable<BroadcastEventResponse>;
  
  // Alert management
  createAlert(request: CreateAlertRequest): Observable<CreateAlertResponse>;
  
  // Health check
  healthCheck(request: HealthCheckRequest): Observable<HealthCheckResponse>;
}

// Webhook delivery types
export interface CreateWebhookDeliveryRequest {
  webhook_event_id: string;
  merchant_id: string;
  webhook_url: string;
  payload: string; // JSON string
  priority: string;
}

export interface CreateWebhookDeliveryResponse {
  success: boolean;
  message: string;
  delivery_id: string;
}

export interface GetWebhookStatusRequest {
  webhook_event_id: string;
}

export interface GetWebhookStatusResponse {
  status: string;
  attempts: number;
  last_error: string;
  processed_at: string;
}

// Notification types
export interface SendNotificationRequest {
  channel: string; // email, sms, push, telegram
  type: string;
  recipient_id: string;
  recipient_contact: string;
  subject: string;
  message: string;
  template_id?: string;
  template_variables?: string; // JSON string
  priority: string;
  scheduled_at?: string;
}

export interface SendNotificationResponse {
  success: boolean;
  message: string;
  notification_id: string;
  external_message_id?: string;
  estimated_cost: number;
}

export interface SendBulkNotificationsRequest {
  notifications: SendNotificationRequest[];
  batch_mode: boolean;
  batch_delay_ms: number;
}

export interface SendBulkNotificationsResponse {
  success: boolean;
  message: string;
  notification_ids: string[];
  successful_count: number;
  failed_count: number;
}

export interface GetNotificationStatusRequest {
  notification_id: string;
}

export interface GetNotificationStatusResponse {
  status: string;
  sent_at: string;
  delivered_at: string;
  error_message?: string;
  cost: number;
}

// Event streaming types
export interface BroadcastEventRequest {
  event_type: string;
  channel: string;
  recipient_id: string;
  room?: string;
  payload: string; // JSON string
  priority: string;
}

export interface BroadcastEventResponse {
  success: boolean;
  message: string;
  event_id: string;
  subscribers_count: number;
}

// Alert types
export interface CreateAlertRequest {
  alert_type: string;
  severity: string; // low, medium, high, critical
  title: string;
  description: string;
  merchant_id?: string;
  source: string;
  source_id: string;
  payload?: string; // JSON string
}

export interface CreateAlertResponse {
  success: boolean;
  message: string;
  alert_id: string;
}

// Health check types
export interface HealthCheckRequest {
  service: string;
}

export interface HealthCheckResponse {
  healthy: boolean;
  status: string;
  version: string;
  uptime: string;
  checks: Record<string, string>;
}

// Payment Engine specific notification types
export interface PaymentNotificationData {
  payment_id: string;
  transaction_id: string;
  merchant_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  customer_email?: string;
  customer_phone?: string;
  order_id?: string;
  failure_reason?: string;
  processed_at: string;
}

export interface WebhookDeliveryData {
  event_type: string;
  payment_data: PaymentNotificationData;
  merchant_webhook_url: string;
  retry_count?: number;
  scheduled_delivery?: string;
}

// Alert types specific to Payment Engine
export interface PaymentEngineAlert {
  type: 'payment_failure' | 'high_decline_rate' | 'tsp_downtime' | 'fraud_detected' | 'system_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  merchant_id?: string;
  transaction_id?: string;
  tsp_name?: string;
  error_details: any;
}
