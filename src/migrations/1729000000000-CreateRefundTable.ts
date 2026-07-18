import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateRefundTable1729000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'refunds',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment'
          },
          {
            name: 'createdAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'updatedAt',
            type: 'timestamp',
            default: 'CURRENT_TIMESTAMP',
            onUpdate: 'CURRENT_TIMESTAMP'
          },
          {
            name: 'deletedAt',
            type: 'timestamp',
            isNullable: true
          },
          {
            name: 'version',
            type: 'int',
            default: 1
          },
          {
            name: 'refundId',
            type: 'varchar',
            length: '64',
            isUnique: true,
            comment: 'Unique refund identifier'
          },
          {
            name: 'merchantId',
            type: 'varchar',
            length: '64',
            comment: 'Merchant ID reference'
          },
          {
            name: 'customerId',
            type: 'varchar',
            length: '128',
            comment: 'Customer ID reference'
          },
          {
            name: 'transactionId',
            type: 'varchar',
            length: '64',
            comment: 'Original transaction ID being refunded'
          },
          {
            name: 'paymentIntentId',
            type: 'varchar',
            length: '64',
            comment: 'Payment intent ID reference'
          },
          {
            name: 'amount',
            type: 'decimal',
            precision: 12,
            scale: 2,
            comment: 'Refund amount'
          },
          {
            name: 'originalAmount',
            type: 'decimal',
            precision: 12,
            scale: 2,
            comment: 'Original transaction amount'
          },
          {
            name: 'currency',
            type: 'varchar',
            length: '3',
            default: "'INR'",
            comment: 'Currency code'
          },
          {
            name: 'refundType',
            type: 'enum',
            enum: ['full', 'partial'],
            default: "'full'",
            comment: 'Refund type: full or partial'
          },
          {
            name: 'status',
            type: 'enum',
            enum: ['pending_approval', 'approved', 'rejected', 'processing', 'completed', 'failed', 'cancelled'],
            default: "'pending_approval'",
            comment: 'Current refund status'
          },
          {
            name: 'autoProcess',
            type: 'boolean',
            default: false,
            comment: 'Auto-process refund without approval'
          },
          {
            name: 'tspProvider',
            type: 'varchar',
            length: '50',
            comment: 'TSP provider used for refund'
          },
          {
            name: 'externalRefundId',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'External refund ID from TSP'
          },
          {
            name: 'reason',
            type: 'text',
            isNullable: true,
            comment: 'Reason for refund'
          },
          {
            name: 'initiatedBy',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Merchant user who initiated refund'
          },
          {
            name: 'approvedBy',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Admin user who approved/rejected'
          },
          {
            name: 'approvedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When refund was approved'
          },
          {
            name: 'approvalNotes',
            type: 'text',
            isNullable: true,
            comment: 'Approval/rejection notes'
          },
          {
            name: 'completedAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'When refund was completed'
          },
          {
            name: 'autoCancelAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'Auto-cancel after this date (T+2 days)'
          },
          {
            name: 'failureReason',
            type: 'text',
            isNullable: true,
            comment: 'Failure reason if refund failed'
          },
          {
            name: 'requestId',
            type: 'varchar',
            length: '64',
            comment: 'Request ID for idempotency'
          },
          {
            name: 'tspResponse',
            type: 'jsonb',
            isNullable: true,
            comment: 'TSP raw response'
          },
          {
            name: 'metadata',
            type: 'jsonb',
            isNullable: true,
            comment: 'Additional metadata'
          },
          {
            name: 'walletBlockTransactionId',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Wallet transaction ID for blocking funds'
          },
          {
            name: 'walletDebitTransactionId',
            type: 'varchar',
            length: '100',
            isNullable: true,
            comment: 'Wallet transaction ID for final debit'
          },
          {
            name: 'blockedAmount',
            type: 'decimal',
            precision: 12,
            scale: 2,
            default: 0,
            comment: 'Amount currently blocked in wallet'
          },
          {
            name: 'environment',
            type: 'varchar',
            length: '20',
            default: "'sandbox'",
            comment: 'Environment'
          },
          {
            name: 'retryCount',
            type: 'int',
            default: 0,
            comment: 'Number of retry attempts'
          },
          {
            name: 'lastRetryAt',
            type: 'timestamp',
            isNullable: true,
            comment: 'Last retry timestamp'
          },
          {
            name: 'processingTimeMs',
            type: 'int',
            isNullable: true,
            comment: 'Processing time in milliseconds'
          }
        ]
      }),
      true
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_refundId',
        columnNames: ['refundId'],
        isUnique: true
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_merchantId_createdAt',
        columnNames: ['merchantId', 'createdAt']
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_transactionId',
        columnNames: ['transactionId']
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_customerId',
        columnNames: ['customerId']
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_status_createdAt',
        columnNames: ['status', 'createdAt']
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_merchantId_status_createdAt',
        columnNames: ['merchantId', 'status', 'createdAt']
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_paymentIntentId',
        columnNames: ['paymentIntentId']
      })
    );

    await queryRunner.createIndex(
      'refunds',
      new TableIndex({
        name: 'IDX_refunds_requestId',
        columnNames: ['requestId'],
        isUnique: true
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('refunds');
  }
}

