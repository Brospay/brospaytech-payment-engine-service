import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as CryptoJS from 'crypto-js';

@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyLength = 32;
  private readonly ivLength = 16;
  private readonly tagLength = 16;
  
  constructor(private readonly configService: ConfigService) {}

  // TSP credential encryption (ultra-secure)
  encryptTSPCredentials(credentials: Record<string, string>): string {
    try {
      const secretKey = this.configService.get<string>('TSP_CREDENTIAL_ENCRYPTION_SECRET');
      if (!secretKey || secretKey.length < this.keyLength) {
        throw new Error('TSP_CREDENTIAL_ENCRYPTION_SECRET must be at least 32 characters');
      }

      const key = crypto.scryptSync(secretKey, 'valorapays-tsp-salt', this.keyLength);
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      const credentialString = JSON.stringify(credentials);
      let encrypted = cipher.update(credentialString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();
      
      // Combine IV + AuthTag + Encrypted data
      const combined = iv.toString('hex') + authTag.toString('hex') + encrypted;
      
      return Buffer.from(combined, 'hex').toString('base64');
    } catch (error) {
      this.logger.error('TSP credential encryption failed', error.stack);
      throw new Error('Failed to encrypt TSP credentials');
    }
  }

  // TSP credential decryption
  decryptTSPCredentials(encryptedData: string): Record<string, string> {
    try {
      const secretKey = this.configService.get<string>('TSP_CREDENTIAL_ENCRYPTION_SECRET');
      if (!secretKey || secretKey.length < this.keyLength) {
        throw new Error('TSP_CREDENTIAL_ENCRYPTION_SECRET must be at least 32 characters');
      }

      const key = crypto.scryptSync(secretKey, 'valorapays-tsp-salt', this.keyLength);
      const combined = Buffer.from(encryptedData, 'base64').toString('hex');

      const iv = Buffer.from(combined.slice(0, this.ivLength * 2), 'hex');
      const authTag = Buffer.from(combined.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2), 'hex');
      const encrypted = combined.slice((this.ivLength + this.tagLength) * 2);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('TSP credential decryption failed', error.stack);
      throw new Error('Failed to decrypt TSP credentials');
    }
  }

  // API key encryption (for storage)
  encryptApiKey(apiKey: string): string {
    try {
      const secretKey = this.configService.get<string>('API_KEY_ENCRYPTION_SECRET');
      return CryptoJS.AES.encrypt(apiKey, secretKey).toString();
    } catch (error) {
      this.logger.error('API key encryption failed', error.stack);
      throw new Error('Failed to encrypt API key');
    }
  }

  // API key decryption
  decryptApiKey(encryptedApiKey: string): string {
    try {
      const secretKey = this.configService.get<string>('API_KEY_ENCRYPTION_SECRET');
      const bytes = CryptoJS.AES.decrypt(encryptedApiKey, secretKey);
      return bytes.toString(CryptoJS.enc.Utf8);
    } catch (error) {
      this.logger.error('API key decryption failed', error.stack);
      throw new Error('Failed to decrypt API key');
    }
  }

  // HMAC signature generation for webhook validation
  generateHMACSignature(payload: string, timestamp: number, secret?: string): string {
    try {
      const hmacSecret = secret || this.configService.get<string>('HMAC_SECRET');
      const message = `${timestamp}.${payload}`;
      return crypto.createHmac('sha256', hmacSecret).update(message).digest('hex');
    } catch (error) {
      this.logger.error('HMAC signature generation failed', error.stack);
      throw new Error('Failed to generate HMAC signature');
    }
  }

  // Verify HMAC signature
  verifyHMACSignature(payload: string, timestamp: number, signature: string, secret?: string): boolean {
    try {
      const expectedSignature = this.generateHMACSignature(payload, timestamp, secret);
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      this.logger.error('HMAC signature verification failed', error.stack);
      return false;
    }
  }

  // Generate secure random strings
  generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  // Hash sensitive data for indexing
  hashSensitiveData(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  // Encrypt sensitive payment data
  encryptPaymentData(data: Record<string, any>): string {
    try {
      const secretKey = this.configService.get<string>('TSP_CREDENTIAL_ENCRYPTION_SECRET');
      const key = crypto.scryptSync(secretKey, 'valorapays-salt', this.keyLength);
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      const dataString = JSON.stringify(data);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');

      const authTag = cipher.getAuthTag();
      const combined = iv.toString('hex') + authTag.toString('hex') + encrypted;
      
      return Buffer.from(combined, 'hex').toString('base64');
    } catch (error) {
      this.logger.error('Payment data encryption failed', error.stack);
      throw new Error('Failed to encrypt payment data');
    }
  }

  // Decrypt sensitive payment data
  decryptPaymentData(encryptedData: string): Record<string, any> {
    try {
      const secretKey = this.configService.get<string>('TSP_CREDENTIAL_ENCRYPTION_SECRET');
      const key = crypto.scryptSync(secretKey, 'valorapays-salt', this.keyLength);
      const combined = Buffer.from(encryptedData, 'base64').toString('hex');

      const iv = Buffer.from(combined.slice(0, this.ivLength * 2), 'hex');
      const authTag = Buffer.from(combined.slice(this.ivLength * 2, (this.ivLength + this.tagLength) * 2), 'hex');
      const encrypted = combined.slice((this.ivLength + this.tagLength) * 2);

      const decipher = crypto.createDecipheriv(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return JSON.parse(decrypted);
    } catch (error) {
      this.logger.error('Payment data decryption failed', error.stack);
      throw new Error('Failed to decrypt payment data');
    }
  }
}
