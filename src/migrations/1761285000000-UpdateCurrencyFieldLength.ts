import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateCurrencyFieldLength1761285000000 implements MigrationInterface {
  name = 'UpdateCurrencyFieldLength1761285000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE payment_intents 
      ALTER COLUMN currency TYPE VARCHAR(10);
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions 
      ALTER COLUMN currency TYPE VARCHAR(10);
    `);

    await queryRunner.query(`
      ALTER TABLE refunds 
      ALTER COLUMN currency TYPE VARCHAR(10);
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN payment_intents.currency IS 'Payment currency code (ISO 4217 for fiat, crypto codes like USDT, BTC)';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN payment_transactions.currency IS 'Transaction currency code (ISO 4217 for fiat, crypto codes like USDT, BTC)';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN refunds.currency IS 'Currency code (ISO 4217 for fiat, crypto codes like USDT, BTC)';
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE refunds 
      ALTER COLUMN currency TYPE VARCHAR(3);
    `);

    await queryRunner.query(`
      ALTER TABLE payment_transactions 
      ALTER COLUMN currency TYPE VARCHAR(3);
    `);

    await queryRunner.query(`
      ALTER TABLE payment_intents 
      ALTER COLUMN currency TYPE VARCHAR(3);
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN payment_intents.currency IS 'Payment currency code (ISO 4217)';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN payment_transactions.currency IS 'Transaction currency code';
    `);

    await queryRunner.query(`
      COMMENT ON COLUMN refunds.currency IS 'Currency code';
    `);
  }
}

