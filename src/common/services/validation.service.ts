import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ValidationService {
  private readonly logger = new Logger(ValidationService.name);

  constructor(private readonly configService: ConfigService) {}

  // Validate payment amount
  validatePaymentAmount(amount: number, currency: string, minAmount?: number, maxAmount?: number): boolean {
    if (amount <= 0) {
      throw new BadRequestException('Payment amount must be greater than zero');
    }

    if (minAmount && amount < minAmount) {
      throw new BadRequestException(`Minimum payment amount is ${minAmount} ${currency}`);
    }

    if (maxAmount && amount > maxAmount) {
      throw new BadRequestException(`Maximum payment amount is ${maxAmount} ${currency}`);
    }

    // Currency-specific validations
    if (currency === 'INR') {
      if (amount < 1) {
        throw new BadRequestException('Minimum payment amount for INR is ₹1');
      }
      if (amount > 200000) { // ₹2 lakh limit for most methods
        throw new BadRequestException('Maximum payment amount for INR is ₹200,000');
      }
    }

    return true;
  }

  // Validate email format
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new BadRequestException('Invalid email format');
    }
    return true;
  }

  // Validate phone number
  validatePhone(phone: string): boolean {
    // Indian phone number validation
    const phoneRegex = /^(\+91|0)?[6-9]\d{9}$/;
    if (!phoneRegex.test(phone.replace(/\s|-/g, ''))) {
      throw new BadRequestException('Invalid phone number format');
    }
    return true;
  }

  // Validate UPI ID
  validateUPIId(upiId: string): boolean {
    const upiRegex = /^[a-zA-Z0-9.-]{2,256}@[a-zA-Z][a-zA-Z0-9.-]{2,64}$/;
    if (!upiRegex.test(upiId)) {
      throw new BadRequestException('Invalid UPI ID format');
    }
    return true;
  }

  // Validate card number (basic Luhn algorithm)
  validateCardNumber(cardNumber: string): boolean {
    const cleanNumber = cardNumber.replace(/\s|-/g, '');
    
    if (!/^\d+$/.test(cleanNumber)) {
      throw new BadRequestException('Card number must contain only digits');
    }

    if (cleanNumber.length < 13 || cleanNumber.length > 19) {
      throw new BadRequestException('Invalid card number length');
    }

    // Luhn algorithm validation
    let sum = 0;
    let isEven = false;

    for (let i = cleanNumber.length - 1; i >= 0; i--) {
      let digit = parseInt(cleanNumber.charAt(i), 10);

      if (isEven) {
        digit *= 2;
        if (digit > 9) {
          digit = Math.floor(digit / 10) + (digit % 10);
        }
      }

      sum += digit;
      isEven = !isEven;
    }

    if (sum % 10 !== 0) {
      throw new BadRequestException('Invalid card number');
    }

    return true;
  }

  // Validate CVV
  validateCVV(cvv: string, cardNumber?: string): boolean {
    const cleanCVV = cvv.replace(/\s/g, '');
    
    if (!/^\d+$/.test(cleanCVV)) {
      throw new BadRequestException('CVV must contain only digits');
    }

    // American Express cards have 4-digit CVV, others have 3
    const isAmex = cardNumber?.startsWith('34') || cardNumber?.startsWith('37');
    const expectedLength = isAmex ? 4 : 3;

    if (cleanCVV.length !== expectedLength) {
      throw new BadRequestException(`CVV must be ${expectedLength} digits`);
    }

    return true;
  }

  // Validate IFSC code
  validateIFSC(ifscCode: string): boolean {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    if (!ifscRegex.test(ifscCode.toUpperCase())) {
      throw new BadRequestException('Invalid IFSC code format');
    }
    return true;
  }

  // Validate bank account number
  validateAccountNumber(accountNumber: string): boolean {
    const cleanNumber = accountNumber.replace(/\s|-/g, '');
    
    if (!/^\d+$/.test(cleanNumber)) {
      throw new BadRequestException('Account number must contain only digits');
    }

    if (cleanNumber.length < 9 || cleanNumber.length > 20) {
      throw new BadRequestException('Account number must be between 9-20 digits');
    }

    return true;
  }

  // Validate merchant ID
  validateMerchantId(merchantId: number): boolean {
    if (!merchantId || merchantId <= 0) {
      throw new BadRequestException('Invalid merchant ID');
    }
    return true;
  }

  // Validate request ID format
  validateRequestId(requestId: string): boolean {
    const requestIdRegex = /^[A-Za-z0-9_-]{10,64}$/;
    if (!requestIdRegex.test(requestId)) {
      throw new BadRequestException('Invalid request ID format');
    }
    return true;
  }

  // Validate currency code
  validateCurrency(currency: string): boolean {
    const supportedCurrencies = ['INR', 'USD', 'EUR', 'GBP'];
    if (!supportedCurrencies.includes(currency.toUpperCase())) {
      throw new BadRequestException(`Unsupported currency: ${currency}`);
    }
    return true;
  }

  // Validate IP address
  validateIPAddress(ipAddress: string): boolean {
    const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
    
    if (!ipv4Regex.test(ipAddress) && !ipv6Regex.test(ipAddress) && ipAddress !== '::1' && ipAddress !== 'localhost') {
      throw new BadRequestException('Invalid IP address format');
    }
    return true;
  }

  // Validate URL format
  validateUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      throw new BadRequestException('Invalid URL format');
    }
  }

  // Business rule validations

  // Validate payment method for amount
  validatePaymentMethodForAmount(paymentMethod: string, amount: number, currency: string): boolean {
    // UPI limits
    if (paymentMethod === 'upi' && currency === 'INR') {
      if (amount > 100000) { // ₹1 lakh UPI limit
        throw new BadRequestException('UPI payments are limited to ₹100,000');
      }
    }

    // Card limits
    if ((paymentMethod === 'credit_card' || paymentMethod === 'debit_card') && currency === 'INR') {
      if (amount > 200000) { // ₹2 lakh card limit
        throw new BadRequestException('Card payments are limited to ₹200,000');
      }
    }

    // Net banking limits
    if (paymentMethod === 'net_banking' && currency === 'INR') {
      if (amount > 1000000) { // ₹10 lakh net banking limit
        throw new BadRequestException('Net banking payments are limited to ₹1,000,000');
      }
    }

    return true;
  }

  // Validate customer data completeness
  validateCustomerData(customerData: any, paymentMethod: string): boolean {
    if (!customerData.email) {
      throw new BadRequestException('Customer email is required');
    }

    // Phone required for certain payment methods
    if (['upi', 'wallet'].includes(paymentMethod) && !customerData.phone) {
      throw new BadRequestException(`Phone number is required for ${paymentMethod} payments`);
    }

    // Address required for international cards
    if (paymentMethod.includes('card') && !customerData.address) {
      // Optional for domestic cards, required for international
    }

    return true;
  }

  // Validate environment consistency
  validateEnvironmentConsistency(requestEnvironment: string, merchantEnvironment: string): boolean {
    // Ensure request environment matches merchant's configured environment
    if (requestEnvironment === 'production' && merchantEnvironment !== 'production') {
      throw new BadRequestException('Production requests not allowed for non-production merchants');
    }

    return true;
  }

  // Sanitize input data
  sanitizeString(input: string, maxLength: number = 255): string {
    if (!input) return '';
    
    return input
      .trim()
      .slice(0, maxLength)
      .replace(/[<>\"']/g, '') // Remove potential XSS characters
      .replace(/\0/g, '');     // Remove null bytes
  }

  // Validate and sanitize metadata
  validateMetadata(metadata: any): Record<string, any> {
    if (!metadata) return {};

    const sanitized: Record<string, any> = {};
    const maxKeys = 20;
    const maxValueLength = 500;
    
    const keys = Object.keys(metadata).slice(0, maxKeys);
    
    for (const key of keys) {
      if (typeof metadata[key] === 'string') {
        sanitized[this.sanitizeString(key, 50)] = this.sanitizeString(metadata[key], maxValueLength);
      } else if (typeof metadata[key] === 'number' || typeof metadata[key] === 'boolean') {
        sanitized[this.sanitizeString(key, 50)] = metadata[key];
      }
      // Skip other data types for security
    }

    return sanitized;
  }

  // Generate validation summary
  async validatePaymentRequest(request: any): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      this.validatePaymentAmount(request.amount, request.currency);
      this.validateEmail(request.customerEmail);
      this.validateRequestId(request.requestId);
      this.validateCurrency(request.currency);
      this.validatePaymentMethodForAmount(request.paymentMethod, request.amount, request.currency);
      this.validateCustomerData(request, request.paymentMethod);

      if (request.customerPhone) {
        this.validatePhone(request.customerPhone);
      }

    } catch (error) {
      errors.push(error.message);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }
}
