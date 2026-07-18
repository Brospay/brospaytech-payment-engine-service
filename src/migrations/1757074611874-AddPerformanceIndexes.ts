import { MigrationInterface, QueryRunner } from "typeorm";

export class AddPerformanceIndexes1757074611874 implements MigrationInterface {
    name = 'AddPerformanceIndexes1757074611874'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_3def0a4a3c540b2cb54d5bc8c3" ON "payment_intents" ("customerId", "status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cf00b2f2c7b7a61a03f9f04c3e" ON "payment_intents" ("preferredPaymentMethod", "currency", "status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_97fce9e4b4f082d0148b2d407f" ON "payment_intents" ("merchantId", "status", "createdAt") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_eaaaac4235547ef659979bed40" ON "tsp_performance_metrics" ("providerName", "measurementWindow", "timestamp") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_13a797e5c67729e56009f56787" ON "payment_transactions" ("responseCode", "tspProvider") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_cd0c747174ca258e11e97caa6a" ON "payment_transactions" ("merchantId", "tspProvider", "status") `);
        await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_78f9758ab95f347b4b9fad091c" ON "payment_transactions" ("tspProvider", "status", "createdAt") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_78f9758ab95f347b4b9fad091c"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cd0c747174ca258e11e97caa6a"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_13a797e5c67729e56009f56787"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_eaaaac4235547ef659979bed40"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_97fce9e4b4f082d0148b2d407f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_cf00b2f2c7b7a61a03f9f04c3e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_3def0a4a3c540b2cb54d5bc8c3"`);
    }

}
