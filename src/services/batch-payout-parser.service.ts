import { Injectable, Logger } from '@nestjs/common';
import * as csv from 'csv-parser';
import * as XLSX from 'xlsx';
import { Readable } from 'stream';
import { z } from 'zod';

export interface ParsedPayoutRow {
  row_number: number;
  customer_email: string;
  customer_phone: string;
  amount: number;
  currency: string;
  beneficiary_name: string;
  beneficiary_account?: string;
  beneficiary_ifsc?: string;
  beneficiary_swift?: string;
  beneficiary_iban?: string;
  beneficiary_vpa?: string;
  bank_name?: string;
  payout_type: string;
  purpose: string;
  description?: string;
  country_code?: string;
  document_id?: string;
}

export interface ValidationError {
  row: number;
  field: string;
  message: string;
}

export interface ParseResult {
  success: boolean;
  data?: ParsedPayoutRow[];
  total_rows: number;
  total_amount: number;
  currency: string;
  validation_errors: ValidationError[];
}

// Zod schemas for validation
const payoutRowSchema = z.object({
  customer_email: z.string().email('Invalid email format'),
  customer_phone: z.string().regex(/^\+[1-9]\d{1,14}$/, 'Invalid phone format (must include country code with +)'),
  amount: z.number().positive('Amount must be greater than 0').multipleOf(0.01, 'Max 2 decimal places'),
  currency: z.enum(['INR', 'USD', 'EUR', 'GBP']),
  beneficiary_name: z.string().min(3, 'Beneficiary name too short').max(100, 'Beneficiary name too long'),
  beneficiary_account: z.string().optional(),
  beneficiary_ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC code').optional(),
  beneficiary_swift: z.string().regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, 'Invalid SWIFT code').optional(),
  beneficiary_iban: z.string().regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/, 'Invalid IBAN').optional(),
  beneficiary_vpa: z.string().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI VPA').optional(),
  bank_name: z.string().max(100).optional(),
  payout_type: z.enum(['bank_transfer', 'upi', 'crypto', 'imps', 'neft', 'rtgs']),
  purpose: z.enum(['SALARY', 'REFUND', 'PAYOUT', 'COMMISSION', 'CASHBACK']),
  description: z.string().max(500).optional(),
  country_code: z.string().regex(/^[A-Z]{2}$/, 'Invalid country code (must be 2-letter ISO code)').optional(),
  document_id: z.string().max(50).optional(),
});

@Injectable()
export class BatchPayoutParserService {
  private readonly logger = new Logger(BatchPayoutParserService.name);

  private readonly REQUIRED_COLUMNS = [
    'customer_email',
    'customer_phone',
    'amount',
    'currency',
    'beneficiary_name',
    'payout_type',
    'purpose',
  ];

  private readonly OPTIONAL_COLUMNS = [
    'beneficiary_account',
    'beneficiary_ifsc',
    'beneficiary_swift',
    'beneficiary_iban',
    'beneficiary_vpa',
    'bank_name',
    'description',
    'country_code',
    'document_id',
  ];

  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
  private readonly MAX_ROWS = 1000;

  /**
   * Parse CSV file
   */
  async parseCSV(buffer: Buffer): Promise<ParseResult> {
    const requestId = `parse_${Date.now()}`;
    this.logger.log(`[${requestId}] Parsing CSV file`);

    try {
      const rows: any[] = [];
      const stream = Readable.from(buffer.toString());

      await new Promise((resolve, reject) => {
        stream
          .pipe(csv())
          .on('data', (row) => {
            rows.push(row);
          })
          .on('end', resolve)
          .on('error', reject);
      });

      this.logger.log(`[${requestId}] Parsed ${rows.length} rows from CSV`);

      return this.validateAndProcessRows(rows, requestId);
    } catch (error) {
      this.logger.error(`[${requestId}] CSV parsing failed: ${error.message}`);
      return {
        success: false,
        total_rows: 0,
        total_amount: 0,
        currency: '',
        validation_errors: [
          {
            row: 0,
            field: 'file',
            message: `CSV parsing failed: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Parse Excel file
   */
  async parseExcel(buffer: Buffer): Promise<ParseResult> {
    const requestId = `parse_${Date.now()}`;
    this.logger.log(`[${requestId}] Parsing Excel file`);

    try {
      const workbook = XLSX.read(buffer, { type: 'buffer' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(worksheet);

      this.logger.log(`[${requestId}] Parsed ${rows.length} rows from Excel`);

      return this.validateAndProcessRows(rows, requestId);
    } catch (error) {
      this.logger.error(`[${requestId}] Excel parsing failed: ${error.message}`);
      return {
        success: false,
        total_rows: 0,
        total_amount: 0,
        currency: '',
        validation_errors: [
          {
            row: 0,
            field: 'file',
            message: `Excel parsing failed: ${error.message}`,
          },
        ],
      };
    }
  }

  /**
   * Validate and process parsed rows
   */
  private async validateAndProcessRows(
    rows: any[],
    requestId: string
  ): Promise<ParseResult> {
    const validationErrors: ValidationError[] = [];
    const validRows: ParsedPayoutRow[] = [];

    // Check file constraints
    if (rows.length === 0) {
      return {
        success: false,
        total_rows: 0,
        total_amount: 0,
        currency: '',
        validation_errors: [
          {
            row: 0,
            field: 'file',
            message: 'File is empty or has no data rows',
          },
        ],
      };
    }

    if (rows.length > this.MAX_ROWS) {
      return {
        success: false,
        total_rows: rows.length,
        total_amount: 0,
        currency: '',
        validation_errors: [
          {
            row: 0,
            field: 'file',
            message: `Too many rows. Maximum ${this.MAX_ROWS} rows allowed, found ${rows.length}`,
          },
        ],
      };
    }

    // Check required columns
    const firstRow = rows[0];
    const missingColumns = this.REQUIRED_COLUMNS.filter(
      (col) => !(col in firstRow)
    );

    if (missingColumns.length > 0) {
      return {
        success: false,
        total_rows: rows.length,
        total_amount: 0,
        currency: '',
        validation_errors: [
          {
            row: 0,
            field: 'columns',
            message: `Missing required columns: ${missingColumns.join(', ')}`,
          },
        ],
      };
    }

    // Validate currency consistency
    const currencies = new Set(rows.map((row) => row.currency));
    if (currencies.size > 1) {
      validationErrors.push({
        row: 0,
        field: 'currency',
        message: `All payouts must be in same currency. Found: ${Array.from(currencies).join(', ')}`,
      });
    }

    const currency = rows[0].currency;

    // Validate each row
    let totalAmount = 0;
    const seenRows = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // Account for header row
      const row = rows[i];

      try {
        // Convert amount to number
        const amount = parseFloat(row.amount);
        if (isNaN(amount)) {
          throw new Error('Invalid amount format');
        }

        // Create row object
        const payoutRow: any = {
          ...row,
          amount,
          row_number: rowNumber,
        };

        // Validate with Zod schema
        const result = payoutRowSchema.safeParse(payoutRow);

        if (!result.success) {
          const zodErrors = result.error.flatten().fieldErrors;
          Object.entries(zodErrors).forEach(([field, messages]) => {
            validationErrors.push({
              row: rowNumber,
              field,
              message: messages?.[0] || 'Validation failed',
            });
          });
          continue;
        }

        // Business logic validations
        const businessErrors = this.validateBusinessRules(result.data, rowNumber);
        validationErrors.push(...businessErrors);

        if (businessErrors.length > 0) {
          continue;
        }

        // Check for duplicates
        const rowKey = `${row.customer_email}_${row.amount}_${row.beneficiary_account || row.beneficiary_vpa}`;
        if (seenRows.has(rowKey)) {
          validationErrors.push({
            row: rowNumber,
            field: 'duplicate',
            message: 'Duplicate payout detected (same email, amount, and account)',
          });
          continue;
        }
        seenRows.add(rowKey);

        validRows.push(result.data as ParsedPayoutRow);
        totalAmount += amount;
      } catch (error) {
        validationErrors.push({
          row: rowNumber,
          field: 'general',
          message: error.message || 'Row validation failed',
        });
      }
    }

    this.logger.log(
      `[${requestId}] Validation complete: ${validRows.length} valid, ${validationErrors.length} errors`
    );

    return {
      success: validationErrors.length === 0,
      data: validRows,
      total_rows: rows.length,
      total_amount: totalAmount,
      currency,
      validation_errors: validationErrors,
    };
  }

  /**
   * Business logic validations
   */
  private validateBusinessRules(row: any, rowNumber: number): ValidationError[] {
    const errors: ValidationError[] = [];

    // Validate payout type specific requirements
    const bankTransferTypes = ['bank_transfer', 'imps', 'neft', 'rtgs'];

    if (bankTransferTypes.includes(row.payout_type)) {
      if (!row.beneficiary_account) {
        errors.push({
          row: rowNumber,
          field: 'beneficiary_account',
          message: 'Bank account required for bank transfer',
        });
      }

      // India specific
      if (row.currency === 'INR' && !row.beneficiary_ifsc) {
        errors.push({
          row: rowNumber,
          field: 'beneficiary_ifsc',
          message: 'IFSC code required for INR bank transfers',
        });
      }

      // International specific
      if (row.currency !== 'INR') {
        if (!row.country_code) {
          errors.push({
            row: rowNumber,
            field: 'country_code',
            message: 'Country code required for international transfers',
          });
        }

        if (row.currency === 'EUR' && !row.beneficiary_iban) {
          errors.push({
            row: rowNumber,
            field: 'beneficiary_iban',
            message: 'IBAN required for EUR transfers',
          });
        }

        if (!row.beneficiary_swift) {
          errors.push({
            row: rowNumber,
            field: 'beneficiary_swift',
            message: 'SWIFT code required for international transfers',
          });
        }

        // Document ID for large amounts
        if (row.amount > 1000 && !row.document_id) {
          errors.push({
            row: rowNumber,
            field: 'document_id',
            message: 'Document ID required for amounts over 1000',
          });
        }
      }
    }

    if (row.payout_type === 'upi') {
      if (!row.beneficiary_vpa) {
        errors.push({
          row: rowNumber,
          field: 'beneficiary_vpa',
          message: 'UPI VPA required for UPI transfers',
        });
      }

      if (row.currency !== 'INR') {
        errors.push({
          row: rowNumber,
          field: 'currency',
          message: 'UPI transfers only support INR currency',
        });
      }
    }

    // Validate phone country code matches country_code
    if (row.country_code && row.customer_phone) {
      const phoneCountryCode = this.getCountryCodeFromPhone(row.customer_phone);
      const expectedCountryCode = this.getPhoneCodeForCountry(row.country_code);
      
      if (phoneCountryCode && expectedCountryCode && phoneCountryCode !== expectedCountryCode) {
        errors.push({
          row: rowNumber,
          field: 'customer_phone',
          message: `Phone country code (+${phoneCountryCode}) doesn't match country (${row.country_code})`,
        });
      }
    }

    return errors;
  }

  /**
   * Extract country code from phone number
   */
  private getCountryCodeFromPhone(phone: string): string | null {
    const match = phone.match(/^\+(\d{1,3})/);
    return match ? match[1] : null;
  }

  /**
   * Get phone code for country
   */
  private getPhoneCodeForCountry(countryCode: string): string | null {
    const phoneCodes: Record<string, string> = {
      IN: '91',
      US: '1',
      GB: '44',
      DE: '49',
      FR: '33',
      // Add more as needed
    };
    return phoneCodes[countryCode] || null;
  }

  /**
   * Validate IBAN checksum (simplified)
   */
  private validateIBAN(iban: string): boolean {
    // Simplified IBAN validation
    const ibanRegex = /^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/;
    return ibanRegex.test(iban);
  }

  getRequiredColumns(): string[] {
    return [...this.REQUIRED_COLUMNS];
  }

  getOptionalColumns(): string[] {
    return [...this.OPTIONAL_COLUMNS];
  }
}

