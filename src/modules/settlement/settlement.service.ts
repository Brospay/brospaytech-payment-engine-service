import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { SmartRoutingService } from '../smart-routing/smart-routing.service';
import { TSPFactoryService } from '../../tsp/tsp-factory.service';
import {
  CreateMerchantSettlementDto,
  MerchantSettlementResponseDto,
  GetSettlementStatusDto,
  SettlementStatusResponseDto,
} from '../../dto/settlement/settlement.dto';

interface MerchantSettlement {
  id: number;
  settlementId: string;
  merchantId: string; // Changed to string for merchant IDs like "mer_xxxxx"
  amount: number;
  currency: string;
  tspProvider: string;
  status: string;
  beneficiaryAccount: string;
  beneficiaryIfsc: string;
  beneficiaryName: string;
  description?: string;
  externalTransactionId?: string;
  routingDecision?: any;
  failureReason?: string;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly smartRoutingService: SmartRoutingService,
    private readonly tspFactoryService: TSPFactoryService,
  ) {}

  async createMerchantSettlement(
    request: CreateMerchantSettlementDto
  ): Promise<MerchantSettlementResponseDto> {
    const startTime = Date.now();

    try {
      this.logger.log(`Creating merchant settlement: ${request.settlementId}`, {
        merchantId: request.merchantId,
        amount: request.amount,
        requestId: request.requestId
      });

      this.logger.log(`Request tspBalances:`, {
        tspBalances_count: request.tspBalances?.length,
        tspBalances: JSON.stringify(request.tspBalances)
      });

      const routingContext = this.buildRoutingContext(request);
      
      this.logger.log(`Routing context built:`, {
        amount: routingContext.amount,
        currency: routingContext.currency,
        tspBalances_count: routingContext.tspBalances?.length
      });
      
      const routingDecision = await this.getSettlementRouting(
        routingContext,
        request.requestId
      );

      this.logger.log(`Routing decision received:`, {
        selectedTSP: routingDecision.selectedTSP,
        fallbackChain: routingDecision.fallbackChain
      });

      const selectedTSPBalance = this.validateTSPBalance(
        routingDecision.selectedTSP,
        request.tspBalances || [],
        request.amount
      );

      this.logger.log(`TSP balance validation result:`, {
        selectedTSPBalance: selectedTSPBalance,
        selectedTSP: routingDecision.selectedTSP
      });

      if (!selectedTSPBalance) {
        const fallbackTSP = this.selectFallbackTSP(
          routingDecision.fallbackChain,
          request.tspBalances || [],
          request.amount
        );

        if (!fallbackTSP) {
          throw new HttpException(
            'No TSP has sufficient balance for settlement',
            HttpStatus.BAD_REQUEST
          );
        }

        this.logger.warn(
          `Using fallback TSP: ${fallbackTSP} (primary had insufficient balance)`,
          { settlementId: request.settlementId }
        );

        routingDecision.selectedTSP = fallbackTSP;
        routingDecision.reasoning.push(
          `Fallback to ${fallbackTSP} due to insufficient balance in primary TSP`
        );
      }

      const tspAdapter = await this.tspFactoryService.getTSPAdapter(
        routingDecision.selectedTSP as any,
        (process.env.NODE_ENV === 'production' ? 'production' : 'sandbox') as any
      );

      this.logger.log(`Executing transfer via ${routingDecision.selectedTSP}`, {
        settlementId: request.settlementId,
        amount: request.amount
      });

      if (!tspAdapter.createPayout) {
        throw new HttpException(
          `TSP ${routingDecision.selectedTSP} does not support payout operations`,
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }

      const transferResult = await tspAdapter.createPayout({
        amount: request.amount,
        currency: request.currency,
        beneficiaryAccount: request.beneficiaryAccount,
        beneficiaryIfsc: request.beneficiaryIfsc,
        beneficiaryName: request.beneficiaryName,
        purpose: 'MERCHANT_SETTLEMENT',
        merchantReference: request.settlementId,
        metadata: {
          merchantId: request.merchantId.toString(),
          settlementType: request.type,
          priority: request.priority
        }
      });

      this.logger.log(`Settlement transfer initiated successfully`, {
        settlementId: request.settlementId,
        tspProvider: routingDecision.selectedTSP,
        externalTxnId: transferResult.transactionId,
        status: transferResult.status
      });

      const response: MerchantSettlementResponseDto = {
        success: true,
        settlementId: request.settlementId,
        status: this.mapTransferStatus(transferResult.status),
        tspProvider: routingDecision.selectedTSP,
        externalTransactionId: transferResult.transactionId,
        amount: request.amount,
        currency: request.currency,
        routingDecision: {
          selectedTSP: routingDecision.selectedTSP,
          confidence: routingDecision.confidence,
          score: routingDecision.score,
          reasoning: routingDecision.reasoning,
          tspBalanceStatus: {
            hasBalance: true,
            availableBalance: selectedTSPBalance?.availableBalance || 0,
            requiredAmount: request.amount
          },
          fallbackChain: routingDecision.fallbackChain
        },
        estimatedCompletion: this.calculateEstimatedCompletion(routingDecision.selectedTSP),
        createdAt: new Date().toISOString()
      };

      return response;

    } catch (error) {
      this.logger.error(`Settlement creation failed: ${error.message}`, {
        settlementId: request.settlementId,
        error: error.stack,
        requestId: request.requestId
      });

      throw new HttpException(
        error.message || 'Settlement processing failed',
        error.status || HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async getSettlementStatus(
    request: GetSettlementStatusDto
  ): Promise<SettlementStatusResponseDto> {
    try {
      this.logger.log(`Getting settlement status: ${request.settlementId}`);

      return {
        success: true,
        settlementId: request.settlementId,
        status: 'PROCESSING',
        amount: 0,
        currency: 'INR',
        tspProvider: 'paytara',
        errorMessage: null
      };

    } catch (error) {
      this.logger.error(`Failed to get settlement status: ${error.message}`, {
        settlementId: request.settlementId,
        error: error.stack
      });

      throw new HttpException(
        'Failed to retrieve settlement status',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  private buildRoutingContext(request: CreateMerchantSettlementDto): any {
    return {
      merchantId: request.merchantId.toString(),
      amount: request.amount,
      currency: request.currency,
      paymentMethod: 'BANK_TRANSFER',
      beneficiaryBank: this.extractBankCode(request.beneficiaryIfsc),
      customerLocation: 'IN',
      environment: process.env.NODE_ENV || 'production',
      
      tspBalanceInfo: request.tspBalances || [],
      
      settlementType: request.type,
      priority: request.priority,
      
      requestId: request.requestId
    };
  }

  private async getSettlementRouting(context: any, requestId: string): Promise<any> {
    const baseDecision = await this.smartRoutingService.getRoutingDecision(
      context,
      requestId
    );

    const tspBalances = context.tspBalanceInfo || [];
    
    const rerankedTSPs = baseDecision.fallbackChain.map(tspName => {
      const tspBalance = tspBalances.find(b => b.tsp_name === tspName);  // Changed to snake_case
      const hasBalance = tspBalance && tspBalance.available_balance >= context.amount;  // Changed to snake_case
      
      return {
        tsp: tspName,
        originalScore: baseDecision.score,
        hasBalance,
        availableBalance: tspBalance?.available_balance || 0,  // Changed to snake_case
        adjustedScore: hasBalance 
          ? baseDecision.score + 10 
          : baseDecision.score - 50
      };
    });

    rerankedTSPs.sort((a, b) => b.adjustedScore - a.adjustedScore);

    const selectedTSP = rerankedTSPs[0];

    return {
      selectedTSP: selectedTSP.tsp,
      confidence: baseDecision.confidence,
      score: selectedTSP.adjustedScore,
      reasoning: [
        ...baseDecision.reasoning,
        `TSP balance check: ${selectedTSP.hasBalance ? 'Sufficient' : 'Insufficient'}`,
        `Available balance: ₹${selectedTSP.availableBalance.toFixed(2)}`
      ],
      factors: baseDecision.factors,
      alternatives: baseDecision.alternatives,
      fallbackChain: rerankedTSPs.map(t => t.tsp),
      routingTime: baseDecision.routingTime,
      timestamp: new Date(),
      analyticsData: {
        ...baseDecision.analyticsData,
        tspBalanceConsidered: true,
        tspBalanceCount: tspBalances.length
      }
    };
  }

  private validateTSPBalance(
    tspName: string,
    tspBalances: any[],  // Changed to any[] since we're using snake_case from proto
    requiredAmount: number
  ): any | null {
    const tspBalance = tspBalances.find(b => b.tsp_name === tspName);  // Changed to snake_case
    
    if (tspBalance && tspBalance.available_balance >= requiredAmount) {  // Changed to snake_case
      return tspBalance;
    }
    
    return null;
  }

  private selectFallbackTSP(
    fallbackChain: string[],
    tspBalances: any[],  // Changed to any[] since we're using snake_case from proto
    requiredAmount: number
  ): string | null {
    for (const tspName of fallbackChain) {
      const tspBalance = tspBalances.find(b => b.tsp_name === tspName);  // Changed to snake_case
      if (tspBalance && tspBalance.available_balance >= requiredAmount) {  // Changed to snake_case
        return tspName;
      }
    }
    return null;
  }

  private extractBankCode(ifscCode: string): string {
    return ifscCode.substring(0, 4);
  }

  private mapTransferStatus(tspStatus: string): string {
    const statusMap: Record<string, string> = {
      'PENDING': 'PROCESSING',
      'PROCESSING': 'PROCESSING',
      'SUCCESS': 'COMPLETED',
      'COMPLETED': 'COMPLETED',
      'FAILED': 'FAILED',
      'REJECTED': 'FAILED'
    };

    return statusMap[tspStatus] || 'PROCESSING';
  }

  private calculateEstimatedCompletion(tspProvider: string): string {
    const estimations: Record<string, string> = {
      'paytara': '1-2 business days',
      'kingdom_bank': '2-3 business days',
      'razorpay': '1 business day',
      'stripe': '3-5 business days'
    };

    return estimations[tspProvider] || '2-3 business days';
  }
}

