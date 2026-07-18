import { ConsoleLogger, Injectable, Scope } from '@nestjs/common';
import * as winston from 'winston';
import 'winston-daily-rotate-file';
import { join } from 'path';

@Injectable({ scope: Scope.TRANSIENT })
export class FileLoggerService extends ConsoleLogger {
  private readonly fileLogger: winston.Logger;
  private readonly logFilePath: string;

  constructor(context: string) {
    super(context);
    
    const logDir = process.env.PAYMENT_ENGINE_LOG_DIR || 'logs';
    this.logFilePath = join(process.cwd(), logDir, 'payment-engine-%DATE%.log');

    this.fileLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json(),
      ),
      transports: [
        new winston.transports.DailyRotateFile({
          filename: this.logFilePath,
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });

    super.log(`FileLoggerService initialized for context: ${context}. Log file: ${this.logFilePath}`);
    this.fileLogger.info({ 
      message: `FileLoggerService initialized for context: ${context}`, 
      logFile: this.logFilePath 
    });
  }

  log(message: any, context?: string) {
    super.log(message, context);
    this.fileLogger.info({ 
      level: 'log', 
      message, 
      context: context || this.context 
    });
  }

  error(message: any, stack?: string, context?: string) {
    super.error(message, stack, context);
    this.fileLogger.error({ 
      level: 'error', 
      message, 
      stack, 
      context: context || this.context 
    });
  }

  warn(message: any, context?: string) {
    super.warn(message, context);
    this.fileLogger.warn({ 
      level: 'warn', 
      message, 
      context: context || this.context 
    });
  }

  debug(message: any, context?: string) {
    super.debug(message, context);
    if (process.env.NODE_ENV === 'development' || process.env.PAYMENT_ENGINE_DEBUG_FILE_LOGGING === 'true') {
      this.fileLogger.debug({ 
        level: 'debug', 
        message, 
        context: context || this.context 
      });
    }
  }

  verbose(message: any, context?: string) {
    super.verbose(message, context);
    this.fileLogger.verbose({ 
      level: 'verbose', 
      message, 
      context: context || this.context 
    });
  }
}

