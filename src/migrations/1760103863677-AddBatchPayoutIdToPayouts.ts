import { MigrationInterface, QueryRunner } from "typeorm";

export class AddBatchPayoutIdToPayouts1760103863677 implements MigrationInterface {
    name = 'AddBatchPayoutIdToPayouts1760103863677'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."batch_payouts_status_enum" AS ENUM('uploaded', 'validating', 'validation_failed', 'validated', 'processing', 'partially_completed', 'completed', 'failed', 'cancelled')`);
        await queryRunner.query(`CREATE TABLE "batch_payouts" ("batch_id" character varying(255) NOT NULL, "merchant_id" character varying(255) NOT NULL, "file_name" character varying(255) NOT NULL, "file_type" character varying(50) NOT NULL, "file_size" integer NOT NULL, "file_path" character varying(500), "total_payouts" integer NOT NULL, "successful_payouts" integer NOT NULL DEFAULT '0', "failed_payouts" integer NOT NULL DEFAULT '0', "pending_payouts" integer NOT NULL DEFAULT '0', "total_amount" numeric(15,2) NOT NULL, "currency" character varying(10) NOT NULL, "total_fees" numeric(15,2) NOT NULL DEFAULT '0', "total_debited_amount" numeric(15,2) NOT NULL DEFAULT '0', "status" "public"."batch_payouts_status_enum" NOT NULL DEFAULT 'uploaded', "validation_errors" jsonb, "processing_stats" jsonb, "failure_reason" text, "webhook_url" character varying(255), "metadata" jsonb, "created_by" character varying(255), "approved_by" character varying(255), "approved_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_7e9852dfc2384171bead7f1f68e" PRIMARY KEY ("batch_id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_fc486d8f5ae53eee90558b3f96" ON "batch_payouts" ("merchant_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_b96338aaa3ee0b12a04bf45b66" ON "batch_payouts" ("status") `);
        await queryRunner.query(`CREATE INDEX "IDX_ac11d978f1538cf8b5d22aee48" ON "batch_payouts" ("merchant_id", "created_at") `);
        await queryRunner.query(`ALTER TABLE "payouts" ADD "batch_payout_id" character varying(255)`);
        await queryRunner.query(`COMMENT ON COLUMN "payouts"."batch_payout_id" IS 'Batch payout ID if part of batch processing'`);
        await queryRunner.query(`ALTER TABLE "payouts" ADD "beneficiaryIban" character varying(50)`);
        await queryRunner.query(`COMMENT ON COLUMN "payouts"."beneficiaryIban" IS 'IBAN for international bank transfers (European banking)'`);
        await queryRunner.query(`CREATE INDEX "IDX_849cbc50ee96a2401d934eed34" ON "payouts" ("batch_payout_id") `);
        await queryRunner.query(`ALTER TABLE "payouts" ADD CONSTRAINT "FK_849cbc50ee96a2401d934eed346" FOREIGN KEY ("batch_payout_id") REFERENCES "batch_payouts"("batch_id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "payouts" DROP CONSTRAINT "FK_849cbc50ee96a2401d934eed346"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_849cbc50ee96a2401d934eed34"`);
        await queryRunner.query(`COMMENT ON COLUMN "payouts"."beneficiaryIban" IS 'IBAN for international bank transfers (European banking)'`);
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "beneficiaryIban"`);
        await queryRunner.query(`COMMENT ON COLUMN "payouts"."batch_payout_id" IS 'Batch payout ID if part of batch processing'`);
        await queryRunner.query(`ALTER TABLE "payouts" DROP COLUMN "batch_payout_id"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ac11d978f1538cf8b5d22aee48"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_b96338aaa3ee0b12a04bf45b66"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_fc486d8f5ae53eee90558b3f96"`);
        await queryRunner.query(`DROP TABLE "batch_payouts"`);
        await queryRunner.query(`DROP TYPE "public"."batch_payouts_status_enum"`);
    }

}
