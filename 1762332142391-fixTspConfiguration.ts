import { MigrationInterface, QueryRunner } from "typeorm";

export class FixTspConfiguration1762332142391 implements MigrationInterface {
    name = 'FixTspConfiguration1762332142391'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_840c354f9da57e6af400c9a139"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_6166e5cccf95d9c1b35661753f"`);
        await queryRunner.query(`ALTER TYPE "public"."tsp_configurations_providername_enum" RENAME TO "tsp_configurations_providername_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."tsp_configurations_providername_enum" AS ENUM('paytara', 'razorpay', 'stripe', 'kingdom_bank')`);
        await queryRunner.query(`ALTER TABLE "tsp_configurations" ALTER COLUMN "providerName" TYPE "public"."tsp_configurations_providername_enum" USING "providerName"::"text"::"public"."tsp_configurations_providername_enum"`);
        await queryRunner.query(`DROP TYPE "public"."tsp_configurations_providername_enum_old"`);
        await queryRunner.query(`CREATE INDEX "IDX_840c354f9da57e6af400c9a139" ON "tsp_configurations" ("providerName", "isActive") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6166e5cccf95d9c1b35661753f" ON "tsp_configurations" ("providerName", "environment") `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP INDEX "public"."IDX_6166e5cccf95d9c1b35661753f"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_840c354f9da57e6af400c9a139"`);
        await queryRunner.query(`CREATE TYPE "public"."tsp_configurations_providername_enum_old" AS ENUM('paytara', 'razorpay', 'stripe', 'kingdom_bank', 'sulifu_pay')`);
        await queryRunner.query(`ALTER TABLE "tsp_configurations" ALTER COLUMN "providerName" TYPE "public"."tsp_configurations_providername_enum_old" USING "providerName"::"text"::"public"."tsp_configurations_providername_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."tsp_configurations_providername_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."tsp_configurations_providername_enum_old" RENAME TO "tsp_configurations_providername_enum"`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_6166e5cccf95d9c1b35661753f" ON "tsp_configurations" ("environment", "providerName") `);
        await queryRunner.query(`CREATE INDEX "IDX_840c354f9da57e6af400c9a139" ON "tsp_configurations" ("isActive", "providerName") `);
    }

}
