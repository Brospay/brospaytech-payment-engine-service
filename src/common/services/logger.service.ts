import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class LoggerService implements NestLoggerService {
  private readonly logLevel: string;
  private readonly enableDetailedLogging: boolean;
  private readonly requestId: string;

  constructor(private readonly configService: ConfigService) {
    this.logLevel = this.configService.get<string>('LOG_LEVEL', 'info');
    this.enableDetailedLogging = this.configService.get<string>('ENABLE_DETAILED_LOGGING') === 'true';
    this.requestId = this.generateRequestId();
  }

  log(message: any, context?: string): void {
    if (this.shouldLog('info')) {
      this.writeLog('INFO', message, context);
    }
  }

  error(message: any, trace?: string, context?: string): void {
    if (this.shouldLog('error')) {
      this.writeLog('ERROR', message, context, trace);
    }
  }

  warn(message: any, context?: string): void {
    if (this.shouldLog('warn')) {
      this.writeLog('WARN', message, context);
    }
  }

  debug(message: any, context?: string): void {
    if (this.shouldLog('debug')) {
      this.writeLog('DEBUG', message, context);
    }
  }

  verbose(message: any, context?: string): void {
    if (this.shouldLog('debug')) {
      this.writeLog('VERBOSE', message, context);
    }
  }

  // Enterprise payment logging methods
  logPaymentIntent(
    intentId: string,
    merchantId: number,
    amount: number,
    status: string,
    requestId: string,
    additionalData?: Record<string, any>
  ): void {
    const logData = {
      event: 'PAYMENT_INTENT',
      intentId,
      merchantId,
      amount,
      status,
      requestId,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    this.writeStructuredLog('INFO', 'PaymentIntent', logData);
  }

  logTSPCall(
    provider: string,
    operation: string,
    requestId: string,
    durationMs: number,
    success: boolean,
    additionalData?: Record<string, any>
  ): void {
    const logData = {
      event: 'TSP_API_CALL',
      provider,
      operation,
      requestId,
      durationMs,
      success,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    this.writeStructuredLog(success ? 'INFO' : 'WARN', 'TSPCall', logData);
  }

  logRoutingDecision(
    requestId: string,
    selectedTSP: string,
    decisionFactors: Record<string, any>,
    decisionTimeMs: number,
    additionalData?: Record<string, any>
  ): void {
    const logData = {
      event: 'ROUTING_DECISION',
      selectedTSP,
      decisionFactors,
      decisionTimeMs,
      requestId,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    this.writeStructuredLog('INFO', 'SmartRouting', logData);
  }

  logPerformanceMetric(
    metricName: string,
    value: number,
    threshold?: number,
    context?: string,
    requestId?: string
  ): void {
    const logData = {
      event: 'PERFORMANCE_METRIC',
      metricName,
      value,
      threshold,
      context,
      requestId: requestId || this.requestId,
      timestamp: new Date().toISOString(),
    };

    const level = threshold && value > threshold ? 'WARN' : 'INFO';
    this.writeStructuredLog(level, 'Performance', logData);
  }

  logSecurityEvent(
    eventType: string,
    severity: string,
    description: string,
    requestId: string,
    additionalData?: Record<string, any>
  ): void {
    const logData = {
      event: 'SECURITY_EVENT',
      eventType,
      severity,
      description,
      requestId,
      timestamp: new Date().toISOString(),
      ...additionalData,
    };

    this.writeStructuredLog(severity.toUpperCase(), 'Security', logData);
  }

  logBankPerformance(
    bankCode: string,
    tspProvider: string,
    successRate: number,
    avgLatency: number,
    isDowntime: boolean,
    requestId: string
  ): void {
    const logData = {
      event: 'BANK_PERFORMANCE',
      bankCode,
      tspProvider,
      successRate,
      avgLatency,
      isDowntime,
      requestId,
      timestamp: new Date().toISOString(),
    };

    const level = isDowntime || successRate < 90 ? 'WARN' : 'INFO';
    this.writeStructuredLog(level, 'BankPerformance', logData);
  }

  // Performance-aware request logging
  logRequest(
    method: string,
    url: string,
    statusCode: number,
    responseTime: number,
    requestId: string,
    userAgent?: string,
    ipAddress?: string
  ): void {
    const logData = {
      event: 'API_REQUEST',
      method,
      url,
      statusCode,
      responseTime,
      requestId,
      userAgent,
      ipAddress,
      timestamp: new Date().toISOString(),
    };

    const level = statusCode >= 400 ? 'WARN' : 'INFO';
    this.writeStructuredLog(level, 'APIRequest', logData);
  }

  // Database query logging
  logDatabaseQuery(
    query: string,
    parameters: any[],
    durationMs: number,
    requestId: string,
    error?: string
  ): void {
    if (!this.enableDetailedLogging && durationMs < 10) {
      return; // Only log slow queries in production
    }

    const logData = {
      event: 'DATABASE_QUERY',
      query: this.sanitizeQuery(query),
      parameterCount: parameters.length,
      durationMs,
      requestId,
      error,
      timestamp: new Date().toISOString(),
    };

    const level = error ? 'ERROR' : (durationMs > 50 ? 'WARN' : 'DEBUG');
    this.writeStructuredLog(level, 'Database', logData);
  }

  private shouldLog(level: string): boolean {
    const levels = ['error', 'warn', 'info', 'debug'];
    const currentLevelIndex = levels.indexOf(this.logLevel);
    const messageLevelIndex = levels.indexOf(level);
    return messageLevelIndex <= currentLevelIndex;
  }

  private writeLog(level: string, message: any, context?: string, trace?: string): void {
    const timestamp = new Date().toISOString();
    const contextStr = context ? `[${context}]` : '';
    const formattedMessage = typeof message === 'object' ? JSON.stringify(message) : message;

    const logEntry = `${timestamp} [${level}] ${contextStr} ${formattedMessage}`;
    
    console.log(logEntry);
    
    if (trace) {
      console.log(`Stack Trace: ${trace}`);
    }
  }

  private writeStructuredLog(level: string, context: string, data: Record<string, any>): void {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      level,
      context,
      service: 'payment-engine',
      environment: process.env.NODE_ENV,
      ...data,
    };

    console.log(JSON.stringify(logEntry));
  }

  private sanitizeQuery(query: string): string {
    // Remove sensitive data from query logs
    return query
      .replace(/('card_number'\s*=\s*)'[^']*'/gi, "$1'****'")
      .replace(/('cvv'\s*=\s*)'[^']*'/gi, "$1'***'")
      .replace(/('account_number'\s*=\s*)'[^']*'/gi, "$1'****'")
      .replace(/('api_key'\s*=\s*)'[^']*'/gi, "$1'****'");
  }

  private generateRequestId(): string {
    return `REQ_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Get logging metrics
  getLoggingMetrics(): Record<string, any> {
    return {
      logLevel: this.logLevel,
      enableDetailedLogging: this.enableDetailedLogging,
      environment: process.env.NODE_ENV,
    };
  }
}
