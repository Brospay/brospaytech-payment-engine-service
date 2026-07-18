import { Controller, Get, Param, Headers, Logger } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { ApiTags, ApiSecurity, ApiParam } from '@nestjs/swagger';
import { PaymentTransactionService } from './payment-transaction.service';
import { PaymentApiEndpoint } from '@/common/decorators/api.decorators';
import { ResponseHelper } from '@/common/helpers/response.helper';
import { 
  GetTransactionsByIntentResponseDto,
  GetTransactionResponseDto 
} from '@/dto/payment';
import { TransactionSummaryResponse } from './types/all.types';
import { extractAndValidateSortParams, extractStringField } from './utils/all.utils';

@Controller('transactions')
@ApiTags('transactions')
@ApiSecurity('API-Key')
export class PaymentTransactionController {
  private readonly logger = new Logger(PaymentTransactionController.name);

  constructor(private readonly transactionService: PaymentTransactionService) {}

  @Get('intent/:intentId')
  @PaymentApiEndpoint(
    'Get Transactions by Payment Intent',
    'Retrieves all transactions associated with a specific payment intent',
    200,
    GetTransactionsByIntentResponseDto
  )
  @ApiParam({
    name: 'intentId',
    description: 'Payment intent ID',
    example: 'pi_abc123def456'
  })
  async getTransactionsByIntent(
    @Param('intentId') intentId: string,
    @Headers('x-request-id') requestId: string,
    @Headers('x-merchant-id') merchantId: string
  ): Promise<GetTransactionsByIntentResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ intentId });

    return ResponseHelper.executeServiceCall(
      () => this.transactionService.getTransactionsByIntent(
        intentId, 
        merchantId, 
        requestId
      ),
      requestId,
      `GET /transactions/intent/${intentId}`,
      'Transactions retrieved successfully',
      'TRANSACTIONS_RETRIEVAL_FAILED',
      'Failed to retrieve transactions'
    ) as unknown as Promise<GetTransactionsByIntentResponseDto>;
  }

  @Get(':transactionId')
  @PaymentApiEndpoint(
    'Get Transaction Details',
    'Retrieves detailed information about a specific transaction',
    200,
    GetTransactionResponseDto
  )
  @ApiParam({
    name: 'transactionId',
    description: 'Transaction ID',
    example: 'txn_abc123def456'
  })
  async getTransaction(
    @Param('transactionId') transactionId: string,
    @Headers('x-request-id') requestId: string,
    @Headers('x-merchant-id') merchantId: string
  ): Promise<GetTransactionResponseDto> {
    ResponseHelper.validateMerchantHeaders(merchantId, requestId);
    ResponseHelper.validateRequiredParams({ transactionId });

    return ResponseHelper.executeServiceCall(
      () => this.transactionService.getTransaction(
        transactionId,
        merchantId,
        requestId
      ),
      requestId,
      `GET /transactions/${transactionId}`,
      'Transaction details retrieved successfully',
      'TRANSACTION_RETRIEVAL_FAILED',
      'Failed to retrieve transaction details'
    ) as unknown as Promise<GetTransactionResponseDto>;
  }

  @GrpcMethod('PaymentEngineService', 'CreateTransaction')
  async createTransaction(data: any): Promise<any> {
    try {

      this.logger.log(`[gRPC] CreateTransaction for merchant ${data.merchant_id}`);
      
      // Validate required fields
      if (!data.merchant_id || !data.customer_name || !data.customer_email || 
          !data.amount || !data.currency || !data.payment_method) {
        return {
          success: false,
          message: 'Missing required fields: merchant_id, customer_name, customer_email, amount, currency, payment_method',
          error_message: 'Validation failed: missing required fields',
        };
      }

      const result = await this.transactionService.createTransactionForMerchant({
        merchantId: data.merchant_id,
        customerName: data.customer_name,
        customerEmail: data.customer_email,
        customerPhone: data.customer_phone || undefined,
        amount: data.amount,
        currency: data.currency,
        paymentMethod: data.payment_method,
        orderId: data.order_id || undefined,
        description: data.description || undefined,
        requestId: data.request_id || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        environment: data.environment || 'production',
        metadata: data.metadata || {},
      });

      return {
        success: true,
        message: 'Transaction created successfully',
        transaction_id: result.transaction.transactionId,
        intent_id: result.intent.intentId,
        transaction: {
          id: result.transaction.transactionId,
          intent_id: result.transaction.paymentIntentId,
          merchant_id: result.transaction.merchantId,
          customer_id: result.intent.customerId || '',
          customer_name: result.transaction.customerName || result.intent.customerName || '',
          customer_email: result.transaction.customerEmail || result.intent.customerEmail || '',
          customer_phone: result.transaction.customerPhone || result.intent.customerPhone || '',
          amount: result.transaction.amount,
          currency: result.transaction.currency,
          status: result.transaction.status,
          payment_method: result.transaction.paymentMethod || '',
          description: result.intent.description || '',
          created_at: result.transaction.createdAt.toISOString(),
          updated_at: result.transaction.updatedAt.toISOString(),
          metadata: result.transaction.metadata || {},
        },
        payment_url: result.paymentUrl || undefined,
        error_message: undefined,
      };
    } catch (error) {
      this.logger.error(`[gRPC] CreateTransaction failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to create transaction: ${error.message}`,
        transaction_id: undefined,
        intent_id: undefined,
        transaction: undefined,
        payment_url: undefined,
        error_message: error.message,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'SearchTransactions')
  async searchTransactions(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] SearchTransactions for merchant ${data.merchant_id}`);
      
      const { transactions, total } = await this.transactionService.getAllTransactions({
        merchantId: data.merchant_id,
        status: data.status || undefined,
        paymentMethod: data.payment_method || undefined,
        startDate: data.start_date || undefined,
        endDate: data.end_date || undefined,
        minAmount: data.min_amount || undefined,
        maxAmount: data.max_amount || undefined,
        customerId: data.customer_id || undefined,
        transactionId: data.transaction_id || undefined,
        environment: data.environment || undefined,
        search: data.search || undefined,
        currency: data.currency || undefined,
        page: data.page || 1,
        limit: data.limit || 20,
      });

      const page = data.page || 1;
      const limit = data.limit || 20;
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'Transactions retrieved successfully',
        transactions: transactions.map((txn) => ({
          id: txn.transactionId,
          intent_id: txn.paymentIntentId,
          merchant_id: txn.merchantId,
          customer_id: txn.intent?.customerId || '',
          customer_name: txn.customerName || txn.intent?.customerName || '',
          customer_email: txn.customerEmail || txn.intent?.customerEmail || '',
          customer_phone: txn.customerPhone || txn.intent?.customerPhone || '',
          amount: txn.amount,
          currency: txn.currency,
          status: txn.status,
          payment_method: txn.paymentMethod || '',
          description: txn.intent?.description || '',
          created_at: txn.createdAt.toISOString(),
          updated_at: txn.updatedAt.toISOString(),
          metadata: txn.metadata || {},
        })),
        total,
        page,
        limit,
        has_next: page < totalPages,
        has_previous: page > 1,
      };
    } catch (error) {
      this.logger.error(`[gRPC] SearchTransactions failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to search transactions: ${error.message}`,
        transactions: [],
        total: 0,
        page: 1,
        limit: 20,
        has_next: false,
        has_previous: false,
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetPendingTransactions')
  async getPendingTransactions(data: any): Promise<any> {
    try {
      const pendingTransactions = await this.transactionService.getPendingTransactions(data.merchant_id);
      return { success: true, message: 'Pending transactions retrieved successfully', pending_transactions: pendingTransactions };
    } catch (error) {
      return { success: false, message: `Failed to get pending transactions: ${error.message}` };
    }
  }
  @GrpcMethod('PaymentEngineService', 'GetFailedTransactions')
  async getFailedTransactions(data: any): Promise<any> {
    try {
      const failedTransactions = await this.transactionService.getFailedTransactions(data.merchant_id);
      return { success: true, message: 'Failed transactions retrieved successfully', failed_transactions: failedTransactions };
    } catch (error) {
      return { success: false, message: `Failed to get failed transactions: ${error.message}` };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetTransactionsSummary')
  async getTransactionsSummary(data: any): Promise<any> {
    try {
      const filters = {
        merchantId: data.merchant_id,
        startDate: data.start_date || undefined,
        endDate: data.end_date || undefined,
        status: data.status || undefined,
        paymentMethod: data.payment_method || undefined,
        currency: data.currency || undefined,
      };
      
      const transactionSummary = await this.transactionService.getTransactionSummary(filters);
      return {
        total_transactions: transactionSummary.totalTransactions,
        total_volume: transactionSummary.totalVolume,
        success_rate: transactionSummary.successRate,
        failed_transactions: transactionSummary.failedTransactions,
        pending_transactions: transactionSummary.pendingTransactions,
        average_amount: transactionSummary.averageTicketSize,
        top_countries: [],
        top_payment_methods: [],
        fraud: {
          total_fraud_alerts: 0,
          fraud_rate: 0,
          blocked_transactions: 0,
        },
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetTransactionsSummary failed: ${error.message}`);
      return {
        total_transactions: 0,
        total_volume: 0,
        success_rate: 0,
        failed_transactions: 0,
        pending_transactions: 0,
        average_amount: 0,
        top_countries: [],
        top_payment_methods: [],
        fraud: {
          total_fraud_alerts: 0,
          fraud_rate: 0,
          blocked_transactions: 0,
        },
      };
    }
  }  

  @GrpcMethod('PaymentEngineService', 'GetTransaction')
  async getTransactionGrpc(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetTransaction ${data.transaction_id} for merchant ${data.merchant_id}`);
      
      const transaction = await this.transactionService.getTransactionById(
        data.transaction_id,
        String(data.merchant_id)
      );

      return {
        success: true,
        message: 'Transaction retrieved successfully',
        transaction: {
          id: transaction.transactionId,
          intent_id: transaction.paymentIntentId,
          merchant_id: transaction.merchantId,
          customer_id: transaction.intent?.customerId || '',
          customer_name: '',
          customer_email: transaction.intent?.customerEmail || '',
          customer_phone: transaction.intent?.customerPhone || '',
          amount: transaction.amount,
          currency: transaction.currency,
          status: transaction.status,
          payment_method: transaction.paymentMethod || '',
          description: transaction.intent?.description || '',
          created_at: transaction.createdAt.toISOString(),
          updated_at: transaction.updatedAt.toISOString(),
          metadata: transaction.metadata || {},
        },
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetTransaction failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to get transaction: ${error.message}`,
        transaction: null,
      };
    }
  }
  @GrpcMethod('PaymentEngineService', 'GetAverageTransactionValue')
  async getAverageTransactionValue(data: any): Promise<any> {
    try {
      const averageTransactionValue = await this.transactionService.getAverageTransactionValue(data.merchant_id);
      return { success: true, message: 'Average transaction value retrieved successfully', average_transaction_value: averageTransactionValue };
    } catch (error) {
      return { success: false, message: `Failed to get average transaction value: ${error.message}` };
    }
  }
  @GrpcMethod('PaymentEngineService', 'GetTransactionVolume')
  async getTransactionVolume(data: any): Promise<any> {
    try {
      const options: { status?: string; startDate?: Date; endDate?: Date } = {};

      if (data.status) {
        options.status = data.status;
      }
      if (data.start_date) {
        options.startDate = new Date(data.start_date);
      }
      if (data.end_date) {
        options.endDate = new Date(data.end_date);
      }

      const transactionVolume = await this.transactionService.getTransactionVolume(
        data.merchant_id,
        options
      );
      return { success: true, message: 'Transaction volume retrieved successfully', transaction_volume: transactionVolume };
    } catch (error) {
      return { success: false, message: `Failed to get transaction volume: ${error.message}` };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetTransactionSuccessRate')
  async getTransactionSuccessRate(data: any): Promise<any> {
    try {
      const options: { startDate?: Date; endDate?: Date } = {};

      if (data.start_date) {
        options.startDate = new Date(data.start_date);
      }
      if (data.end_date) {
        options.endDate = new Date(data.end_date);
      }

      const transactionSuccessRate = await this.transactionService.getTransactionSuccessRate(
        data.merchant_id,
        options
      );
      return { success: true, message: 'Transaction success rate retrieved successfully', transaction_success_rate: transactionSuccessRate };
    } catch (error) {
      return { success: false, message: `Failed to get transaction success rate: ${error.message}` };
    }
  }


  @GrpcMethod('PaymentEngineService', 'GetAllTransactions')
  async getAllTransactions(data: any): Promise<any> {
    try {
      const currencyValue = extractStringField(data, 'currency', 'currency');
      const customerId = extractStringField(data, 'customer_id', 'customerId');
      const transactionType = data.type || data.transactionType || undefined;
      const { sortBy, sortOrder } = extractAndValidateSortParams(data);
      
      const serviceFilters = {
        merchantId: data.merchant_id || data.merchantId || undefined,
        status: data.status || undefined,
        paymentMethod: data.payment_method || data.paymentMethod || undefined,
        startDate: data.start_date || data.startDate || undefined,
        endDate: data.end_date || data.endDate || undefined,
        minAmount: data.min_amount || data.minAmount || undefined,
        maxAmount: data.max_amount || data.maxAmount || undefined,
        riskLevel: data.risk_level || data.riskLevel || undefined,
        customerIdentifier: customerId,
        customerId: customerId,
        transactionId: data.transaction_id || data.transactionId || undefined,
        search: data.search || undefined,
        currency: currencyValue,
        type: transactionType,
        sortBy: sortBy,
        sortOrder: sortOrder,
        page: data.page || 1,
        limit: data.limit || 20,
      };
      
      const { transactions, total } = await this.transactionService.getAllTransactions(serviceFilters);

      const page = data.page || 1;
      const limit = data.limit || 20;
      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        message: 'All transactions retrieved successfully',
        data: {
          transactions: transactions.map((txn) => ({
            id: txn.transactionId,
            transaction_id: txn.transactionId,
            intent_id: txn.paymentIntentId,
            merchant_id: 0, // int32 field retained
            merchant_id_string: txn.merchantId,
            customer_id: txn.intent?.customerId || '',
            customer_name: txn.intent?.metadata?.customerName || '',
            customer_email: txn.intent?.customerEmail || '',
            customer_phone: txn.intent?.customerPhone || '',
            amount: txn.amount,
            currency: txn.currency || 'INR',
            status: txn.status,
            payment_method: txn.paymentMethod || '',
            risk_level: txn.fraudAssessment?.riskLevel || 'low',
            risk_score: txn.fraudAssessment?.riskScore || 0,
            description: txn.intent?.description || '',
            created_at: txn.createdAt.toISOString(),
            updated_at: txn.updatedAt.toISOString(),
            metadata: txn.metadata || {},
          })),
          pagination: {
            total,
            page,
            limit,
            total_pages: totalPages,
            has_next: page < totalPages,
            has_previous: page > 1,
          },
        },
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetAllTransactions failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to get all transactions: ${error.message}`,
        data: {
          transactions: [],
          pagination: {
            total: 0,
            page: 1,
            limit: 20,
            total_pages: 0,
            has_next: false,
            has_previous: false,
          },
        },
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'GetTransactionAnalytics')
  async getTransactionAnalyticsGrpc(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] GetTransactionAnalytics for merchant ${data.merchant_id}, period: ${data.period}`);
      
      const period = data.period || 'all';
      let startDate: Date;
      const endDate = new Date();

      switch (period) {
        case 'today':
          startDate = new Date(endDate.getTime() - 1 * 24 * 60 * 60 * 1000);
          break;
        case 'week':
        case '7d':
          startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
        case '30d':
          startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
        case 'quarter':
        case '90d':
          startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case 'year':
          startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case 'all':
        default:
          // Get ALL transactions - set startDate to a very old date
          startDate = new Date('2020-01-01');
          break;
      }

      const { transactions } = await this.transactionService.getAllTransactions({
        merchantId: data.merchant_id,
        startDate: period === 'all' ? undefined : startDate.toISOString(),
        endDate: period === 'all' ? undefined : endDate.toISOString(),
        environment: data.environment || undefined,
        currency: data.currency || undefined,
        limit: 10000,
      });

      const totalTransactions = transactions.length;
      const successfulTransactions = transactions.filter((t) => t.status === 'success').length;
      const failedTransactions = transactions.filter((t) => t.status === 'failed').length;
      
      this.logger.debug(`[gRPC] Analytics calculation: total=${totalTransactions}, successful=${successfulTransactions}, failed=${failedTransactions}`);
      
      const successfulTransactionsList = transactions.filter((t) => t.status === 'success');
      this.logger.debug(`[gRPC] Successful transactions sample:`, successfulTransactionsList.slice(0, 3).map(t => ({ id: t.transactionId, amount: t.amount, currency: t.intent?.currency })));
      
      const totalVolume = successfulTransactionsList.reduce((sum, t) => {
        const amount = Number(t.amount) || 0;
        this.logger.debug(`[gRPC] Adding amount: ${amount} to sum: ${sum}`);
        return sum + amount;
      }, 0);
      
      this.logger.debug(`[gRPC] Total volume calculated: ${totalVolume}`);
      
      const successRate = totalTransactions > 0 ? (successfulTransactions / totalTransactions) * 100 : 0;
      const averageTransactionValue = successfulTransactions > 0 ? totalVolume / successfulTransactions : 0;

      const uniqueCustomers = new Set(
        transactions
          .map((t) => t.intent?.customerId)
          .filter(Boolean)
      ).size;

      const paymentMethods = transactions.reduce((acc, t) => {
        const method = t.paymentMethod || 'unknown';
        if (!acc[method]) {
          acc[method] = { count: 0, volume: 0 };
        }
        acc[method].count++;
        if (t.status === 'success') {
          acc[method].volume += t.amount;
        }
        return acc;
      }, {} as Record<string, { count: number; volume: number }>);

      const topPaymentMethods = Object.entries(paymentMethods)
        .map(([method, data]) => ({
          method,
          count: data.count,
          volume: data.volume,
        }))
        .sort((a, b) => b.volume - a.volume)
        .slice(0, 5);

      return {
        success: true,
        message: 'Analytics retrieved successfully',
        period,
        date_range: {
          start_date: period === 'all' ? null : startDate.toISOString(),
          end_date: period === 'all' ? null : endDate.toISOString(),
        },
        metrics: {
          total_transactions: totalTransactions,
          successful_transactions: successfulTransactions,
          failed_transactions: failedTransactions,
          total_volume: totalVolume,
          success_rate: successRate,
          average_transaction_value: averageTransactionValue,
          unique_customers: uniqueCustomers,
        },
        trends: [],
        top_payment_methods: topPaymentMethods,
      };
    } catch (error) {
      this.logger.error(`[gRPC] GetTransactionAnalytics failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to get analytics: ${error.message}`,
        period: data.period || 'all',
        date_range: null,
        metrics: null,
        trends: [],
        top_payment_methods: [],
      };
    }
  }

  @GrpcMethod('PaymentEngineService', 'ExportTransactions')
  async exportTransactionsGrpc(data: any): Promise<any> {
    try {
      this.logger.log(`[gRPC] ExportTransactions for merchant ${data.merchant_id}, format: ${data.format}`);
      
      const { transactions } = await this.transactionService.getAllTransactions({
        merchantId: data.merchant_id_string || String(data.merchant_id), // Use string merchant ID
        status: data.status || undefined,
        paymentMethod: data.payment_method || undefined,
        startDate: data.start_date || undefined,
        endDate: data.end_date || undefined,
        environment: data.environment || undefined,
        limit: 50000,
      });

      const exportId = `exp_${Date.now()}_${Math.random().toString(36).substring(7)}`;
      
      return {
        success: true,
        message: 'Export initiated successfully',
        export_id: exportId,
        format: data.format,
        record_count: transactions.length,
        download_url: `/api/exports/${exportId}`,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      };
    } catch (error) {
      this.logger.error(`[gRPC] ExportTransactions failed: ${error.message}`);
      return {
        success: false,
        message: `Failed to export transactions: ${error.message}`,
        export_id: '',
        format: data.format,
        record_count: 0,
        download_url: '',
        expires_at: '',
      };
    }
  }
}
