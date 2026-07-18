import { Injectable, Logger, BadRequestException, NotFoundException, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In, Between } from 'typeorm';
import { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, Observable } from 'rxjs';
import { BatchPayout, BatchPayoutStatus } from '../../entities/batch-payout.entity';
import { Payout, PayoutStatus, PayoutType } from '../../entities/payout.entity';
import { BatchPayoutParserService, ParsedPayoutRow } from '../../services/batch-payout-parser.service';
import { AuthenticatedGrpcService } from '../../grpc/authenticated-grpc.service';
import { v4 as uuidv4 } from 'uuid';

interface WalletBalanceResponse {
  success: boolean;
  wallet?: {
    available_balance: string;
    blocked_balance: string;
    total_balance: string;
  };
  message?: string;
}

interface BlockBalanceResponse {
  success: boolean;
  message?: string;
  blocked_amount?: number;
}

interface WalletService {
  GetCurrencyWalletBalance(data: any): Observable<WalletBalanceResponse>;
  BlockBalance(data: any): Observable<BlockBalanceResponse>;
  ReleaseBlockedBalance(data: any): any;
  DebitBlockedAmount(data: any): any;
}

@Injectable()
export class BatchPayoutService implements OnModuleInit {
  private readonly logger = new Logger(BatchPayoutService.name);
  private walletService: WalletService;

  constructor(
    @InjectRepository(BatchPayout)
    private batchPayoutRepository: Repository<BatchPayout>,
    @InjectRepository(Payout)
    private payoutRepository: Repository<Payout>,
    private batchParserService: BatchPayoutParserService,
    private authenticatedGrpcService: AuthenticatedGrpcService,
    @Inject('WALLET_SERVICE') private walletClient: ClientGrpc,
  ) {}

  onModuleInit() {
    this.walletService = this.walletClient.getService<WalletService>('WalletService');
  }

  /**
   * Upload and parse batch payout file
   */
  async uploadBatchPayout(data: {
    merchant_id: string;
    file_content: Buffer;
    file_name: string;
    file_type: string;
    webhook_url?: string;
    request_id: string;
  }): Promise<any> {
    const { merchant_id, file_content, file_name, file_type, webhook_url, request_id } = data;

    this.logger.log(`[${request_id}] Uploading batch payout file for merchant ${merchant_id}`);

    try {
      // Validate file size
      if (file_content.length > 5 * 1024 * 1024) {
        throw new BadRequestException('File size exceeds 5MB limit');
      }

      // Parse file based on type
      let parseResult;
      if (file_type === 'csv') {
        parseResult = await this.batchParserService.parseCSV(file_content);
      } else if (file_type === 'xlsx' || file_type === 'xls') {
        parseResult = await this.batchParserService.parseExcel(file_content);
      } else {
        throw new BadRequestException('Unsupported file type. Only CSV and Excel files are allowed');
      }

      // If parsing failed
      if (!parseResult.success) {
        return {
          success: false,
          validation_errors: parseResult.validation_errors,
          message: 'File validation failed',
        };
      }

      // Calculate estimated fees (using merchant's fee configuration)
      const feeResult = await this.calculateBatchFees(
        merchant_id,
        parseResult.total_amount,
        parseResult.currency,
        parseResult.data.length
      );

      // Create batch payout record
      const batchId = `batch_${Date.now()}_${merchant_id.slice(4, 12)}`;
      const metadata = {
        parsed_at: new Date().toISOString(),
        preview_rows: parseResult.data.slice(0, 5),
        parsed_rows: parseResult.data,
        required_columns: this.batchParserService.getRequiredColumns(),
        optional_columns: this.batchParserService.getOptionalColumns(),
        validation_summary: {
          total_rows: parseResult.total_rows,
          total_amount: parseResult.total_amount,
          currency: parseResult.currency,
        },
      };

      const batch = this.batchPayoutRepository.create({
        batch_id: batchId,
        merchant_id,
        file_name,
        file_type,
        file_size: file_content.length,
        total_payouts: parseResult.total_rows,
        total_amount: parseResult.total_amount,
        currency: parseResult.currency,
        total_fees: feeResult.total_fees,
        total_debited_amount: parseResult.total_amount + feeResult.total_fees,
        status: BatchPayoutStatus.VALIDATED,
        validation_errors: [],
        webhook_url,
        metadata,
      });

      await this.batchPayoutRepository.save(batch);

      this.logger.log(`[${request_id}] Batch ${batchId} created successfully with ${parseResult.total_rows} payouts`);

      return {
        success: true,
        batch_id: batchId,
        total_payouts: parseResult.total_rows,
        total_amount: parseResult.total_amount,
        currency: parseResult.currency,
        estimated_fees: feeResult.total_fees,
        status: 'validated',
        message: 'Batch payout uploaded and validated successfully',
        preview_data: parseResult.data.slice(0, 5).map(row => ({
          row_number: row.row_number,
          customer_email: row.customer_email,
          beneficiary_name: row.beneficiary_name,
          amount: row.amount,
          currency: row.currency,
          payout_type: row.payout_type,
          beneficiary_account: row.beneficiary_account || row.beneficiary_vpa,
        })),
        parsed_data: parseResult.data, // Store for confirmation
        required_columns: metadata.required_columns,
        optional_columns: metadata.optional_columns,
      };
    } catch (error) {
      this.logger.error(`[${request_id}] Batch payout upload failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Confirm and start processing batch payout
   */
  async confirmBatchPayout(data: {
    merchant_id: string;
    batch_id: string;
    request_id: string;
  }): Promise<any> {
    const { merchant_id, batch_id, request_id } = data;

    this.logger.log(`[${request_id}] Confirming batch ${batch_id} for merchant ${merchant_id}`);

    try {
      // Get batch
      const batch = await this.batchPayoutRepository.findOne({
        where: { batch_id, merchant_id },
      });

      if (!batch) {
        throw new NotFoundException('Batch payout not found');
      }

      if (batch.status !== BatchPayoutStatus.VALIDATED) {
        throw new BadRequestException(`Batch cannot be confirmed. Current status: ${batch.status}`);
      }

      // Check wallet balance
      const walletBalance = await firstValueFrom(
        this.walletService.GetCurrencyWalletBalance({
          merchant_id,
          currency: batch.currency,
          request_id,
        })
      );

      if (!walletBalance.success) {
        throw new BadRequestException('Failed to fetch wallet balance');
      }

      const availableBalance = parseFloat(walletBalance.wallet?.available_balance || '0');
      if (availableBalance < batch.total_debited_amount) {
        throw new BadRequestException(
          `Insufficient wallet balance. Required: ${batch.total_debited_amount}, Available: ${availableBalance}`
        );
      }

      // Block amount in wallet
      const blockResult = await firstValueFrom(
        this.walletService.BlockBalance({
          merchant_id,
          amount: batch.total_debited_amount,
          currency: batch.currency,
          reference_id: batch_id,
          reference_type: 'batch_payout',
          description: `Batch payout: ${batch.file_name}`,
          request_id,
        })
      );

      if (!blockResult.success) {
        throw new BadRequestException('Failed to block wallet amount');
      }

      // Create individual payout records
      const parsedRows = Array.isArray(batch.metadata?.parsed_rows)
        ? (batch.metadata?.parsed_rows as ParsedPayoutRow[])
        : undefined;

      if (!parsedRows || parsedRows.length === 0) {
        throw new BadRequestException('Batch payout data unavailable. Please re-upload the file.');
      }

      const payouts = await this.createIndividualPayouts(batch, parsedRows, request_id);

      // Update batch status
      batch.status = BatchPayoutStatus.PROCESSING;
      batch.pending_payouts = payouts.length;
      batch.processing_stats = {
        started_at: new Date().toISOString(),
      };
      if (batch.metadata) {
        batch.metadata.preview_rows = batch.metadata.preview_rows || parsedRows.slice(0, 5);
        if (batch.metadata.parsed_rows) {
          delete batch.metadata.parsed_rows;
        }
      } else {
        batch.metadata = {
          preview_rows: parsedRows.slice(0, 5),
          processed_at: new Date().toISOString(),
        };
      }
      await this.batchPayoutRepository.save(batch);

      // TODO: Queue payouts for parallel processing (will implement with Bull)
      // For now, we'll process sequentially in background
      this.processPayouts(batch_id, payouts, request_id).catch(error => {
        this.logger.error(`[${request_id}] Batch processing failed: ${error.message}`);
      });

      this.logger.log(`[${request_id}] Batch ${batch_id} processing started with ${payouts.length} payouts`);

      return {
        success: true,
        batch_id,
        status: 'processing',
        message: `Batch payout processing started with ${payouts.length} payouts`,
      };
    } catch (error) {
      this.logger.error(`[${request_id}] Batch confirmation failed: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Get batch payout status
   */
  async getBatchStatus(data: {
    merchant_id: string;
    batch_id: string;
    request_id: string;
  }): Promise<any> {
    const { merchant_id, batch_id, request_id } = data;

    this.logger.log(`[${request_id}] Getting status for batch ${batch_id}`);

    try {
      const batch = await this.batchPayoutRepository.findOne({
        where: { batch_id, merchant_id },
      });

      if (!batch) {
        throw new NotFoundException('Batch payout not found');
      }

      const progressPercentage = batch.total_payouts > 0
        ? ((batch.successful_payouts + batch.failed_payouts) / batch.total_payouts) * 100
        : 0;

      return {
        success: true,
        batch_id,
        status: batch.status,
        total_payouts: batch.total_payouts,
        successful_payouts: batch.successful_payouts,
        failed_payouts: batch.failed_payouts,
        pending_payouts: batch.pending_payouts,
        progress_percentage: Math.round(progressPercentage),
        processing_stats: batch.processing_stats || {},
        total_amount: batch.total_amount,
        currency: batch.currency,
        total_fees: batch.total_fees,
      };
    } catch (error) {
      this.logger.error(`[${request_id}] Get batch status failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * List batch payouts
   */
  async listBatches(data: {
    merchant_id: string;
    page: number;
    limit: number;
    status?: string;
    from_date?: string;
    to_date?: string;
    request_id: string;
  }): Promise<any> {
    const { merchant_id, page, limit, status, from_date, to_date, request_id } = data;

    this.logger.log(`[${request_id}] Listing batches for merchant ${merchant_id}`);

    try {
      const where: any = { merchant_id };

      if (status && status !== 'all') {
        where.status = status;
      }

      if (from_date && to_date) {
        where.created_at = Between(new Date(from_date), new Date(to_date));
      }

      const [batches, total] = await this.batchPayoutRepository.findAndCount({
        where,
        skip: (page - 1) * limit,
        take: limit,
        order: { created_at: 'DESC' },
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        batches: batches.map(batch => ({
          batch_id: batch.batch_id,
          file_name: batch.file_name,
          status: batch.status,
          total_payouts: batch.total_payouts,
          successful_payouts: batch.successful_payouts,
          failed_payouts: batch.failed_payouts,
          pending_payouts: batch.pending_payouts,
          total_amount: batch.total_amount,
          currency: batch.currency,
          total_fees: batch.total_fees,
          created_at: batch.created_at.toISOString(),
          updated_at: batch.updated_at.toISOString(),
          progress_percentage: batch.total_payouts > 0
            ? Math.round(((batch.successful_payouts + batch.failed_payouts) / batch.total_payouts) * 100)
            : 0,
        })),
        pagination: {
          page,
          limit,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`[${request_id}] List batches failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get payouts for a batch
   */
  async getBatchPayouts(data: {
    merchant_id: string;
    batch_id: string;
    page: number;
    limit: number;
    status?: string;
    request_id: string;
  }): Promise<any> {
    const { merchant_id, batch_id, page, limit, status, request_id } = data;

    this.logger.log(`[${request_id}] Getting payouts for batch ${batch_id}`);

    try {
      const where: any = { merchantId: merchant_id, batch_payout_id: batch_id };

      if (status && status !== 'all') {
        where.status = status;
      }

      const [payouts, total] = await this.payoutRepository.findAndCount({
        where,
        skip: (page - 1) * limit,
        take: limit,
        order: { createdAt: 'DESC' },
      });

      const totalPages = Math.ceil(total / limit);

      return {
        success: true,
        batch_id,
        payouts: payouts.map(payout => ({
          payout_id: payout.payoutId,
          customer_email: payout.customerEmail,
          beneficiary_name: payout.beneficiaryName,
          amount: payout.amount,
          currency: payout.currency,
          status: payout.status,
          payout_type: payout.payoutType,
          tsp_provider: payout.tspProvider,
          failure_reason: payout.failureReason,
          created_at: payout.createdAt.toISOString(),
        })),
        pagination: {
          page,
          limit,
          total,
          total_pages: totalPages,
          has_next: page < totalPages,
          has_prev: page > 1,
        },
      };
    } catch (error) {
      this.logger.error(`[${request_id}] Get batch payouts failed: ${error.message}`);
      throw error;
    }
  }

  /**
   * Calculate batch fees
   */
  private async calculateBatchFees(
    merchantId: string,
    totalAmount: number,
    currency: string,
    payoutCount: number
  ): Promise<{ total_fees: number }> {
    // TODO: Fetch merchant fee configuration from merchant service
    // For now, using a flat fee structure
    const feePercentage = 0.5; // 0.5%
    const flatFeePerPayout = 5; // 5 currency units

    const percentageFee = (totalAmount * feePercentage) / 100;
    const flatFees = payoutCount * flatFeePerPayout;
    const totalFees = percentageFee + flatFees;

    return { total_fees: parseFloat(totalFees.toFixed(2)) };
  }

  /**
   * Create individual payout records
   */
  private async createIndividualPayouts(
    batch: BatchPayout,
    parsedData: ParsedPayoutRow[],
    requestId: string
  ): Promise<Payout[]> {
    this.logger.log(`[${requestId}] Creating ${parsedData.length} individual payout records for batch ${batch.batch_id}`);

    const payouts: Payout[] = [];

    for (const row of parsedData) {
      const payoutId = `payout_${Date.now()}_${uuidv4().slice(0, 8)}`;
      
      // Map payout_type string to PayoutType enum
      const payoutTypeMap: Record<string, PayoutType> = {
        'bank_transfer': PayoutType.BANK_TRANSFER,
        'upi': PayoutType.UPI,
        'imps': PayoutType.IMPS,
        'neft': PayoutType.NEFT,
        'rtgs': PayoutType.RTGS,
        'crypto': PayoutType.CRYPTO,
      };
      
      const payout = this.payoutRepository.create({
        payoutId,
        merchantId: batch.merchant_id,
        batch_payout_id: batch.batch_id,
        customerId: row.customer_email, // Using email as customer ID for now
        customerEmail: row.customer_email,
        customerPhone: row.customer_phone,
        beneficiaryName: row.beneficiary_name,
        beneficiaryAccount: row.beneficiary_account,
        beneficiaryIfsc: row.beneficiary_ifsc,
        beneficiarySwift: row.beneficiary_swift,
        beneficiaryIban: row.beneficiary_iban,
        beneficiaryVpa: row.beneficiary_vpa,
        bankName: row.bank_name,
        amount: row.amount,
        currency: row.currency,
        payoutType: payoutTypeMap[row.payout_type] || PayoutType.BANK_TRANSFER,
        purpose: row.purpose,
        description: row.description || `Batch payout: ${batch.file_name}`,
        status: PayoutStatus.INITIATED,
        metadata: {
          batch_id: batch.batch_id,
          row_number: row.row_number,
          country_code: row.country_code,
          document_id: row.document_id,
        },
      });

      payouts.push(payout);
    }

    await this.payoutRepository.save(payouts);

    this.logger.log(`[${requestId}] Created ${payouts.length} payout records`);

    return payouts;
  }

  /**
   * Process payouts (placeholder for queue-based processing)
   */
  private async processPayouts(batchId: string, payouts: Payout[], requestId: string): Promise<void> {
    this.logger.log(`[${requestId}] Starting to process ${payouts.length} payouts for batch ${batchId}`);

    // TODO: Implement queue-based parallel processing with Bull
    // For now, this is a placeholder
    // Each payout will be queued and processed by workers

    this.logger.log(`[${requestId}] Payouts queued for processing`);
  }
}

