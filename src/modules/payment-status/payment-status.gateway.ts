import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  cors: {
    origin: (origin, callback) => {
      const allowedOrigins = [
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:5001',
        'http://localhost:3001',
        'https://pay-sandbox.valorapayss.io',
        'https://pay.valorapayss.io',
        'https://dashboard-sandbox.valorapayss.io',
        'https://dashboard.valorapayss.io',
        'https://admin-sandbox.valorapayss.io',
        'https://admin.valorapayss.io',
        'https://api-sandbox.valorapayss.io',
        'https://api.valorapayss.io',
        'https://api-staging.valorapayss.io',
      ];
      
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true);
      }
    },
    credentials: true,
  },
  namespace: '/payment-status',
  transports: ['websocket', 'polling'],
})
export class PaymentStatusGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private logger = new Logger(PaymentStatusGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('subscribe-payment')
  handleSubscribePayment(
    @MessageBody() data: { intentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `payment:${data.intentId}`;
    client.join(room);
    this.logger.log(`Client ${client.id} subscribed to payment: ${data.intentId}`);
    
    client.emit('subscribed', { 
      intentId: data.intentId, 
      message: 'Successfully subscribed to payment updates' 
    });
  }

  @SubscribeMessage('unsubscribe-payment')
  handleUnsubscribePayment(
    @MessageBody() data: { intentId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const room = `payment:${data.intentId}`;
    client.leave(room);
    this.logger.log(`Client ${client.id} unsubscribed from payment: ${data.intentId}`);
  }

  emitPaymentUpdate(intentId: string, status: string, data?: any) {
    const room = `payment:${intentId}`;
    this.logger.log(`Emitting payment update to room ${room}: ${status}`);
    
    this.server.to(room).emit('payment-update', {
      intentId,
      status,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  emitCryptoPaymentConfirmed(intentId: string, data: any) {
    const room = `payment:${intentId}`;
    this.logger.log(`Emitting crypto payment confirmation to room ${room}`);
    
    this.server.to(room).emit('payment-confirmed', {
      intentId,
      status: 'confirmed',
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  emitPaymentSuccess(intentId: string, transactionId: string) {
    const room = `payment:${intentId}`;
    this.logger.log(`Emitting payment success to room ${room}`);
    
    this.server.to(room).emit('payment-success', {
      intentId,
      transactionId,
      status: 'succeeded',
      timestamp: new Date().toISOString(),
    });
  }

  emitPaymentFailure(intentId: string, error: string) {
    const room = `payment:${intentId}`;
    this.logger.log(`Emitting payment failure to room ${room}`);
    
    this.server.to(room).emit('payment-failed', {
      intentId,
      error,
      status: 'failed',
      timestamp: new Date().toISOString(),
    });
  }
}

