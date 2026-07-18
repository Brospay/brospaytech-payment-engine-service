import { MigrationInterface, QueryRunner } from 'typeorm';

export class FixAllTablesDecimalPrecision1730700000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    console.log('🔧 Fixing all payment engine tables decimal precision for cryptocurrency support...');

    const columnsToCheck = await queryRunner.query(`
      SELECT table_name, column_name, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
      AND data_type = 'numeric'
      AND (numeric_scale = 2 OR numeric_precision <= 15)
      AND table_name IN ('payouts', 'batch_payouts', 'refunds')
      ORDER BY table_name, column_name;
    `);

    console.log(`Found ${columnsToCheck.length} columns to update:`, columnsToCheck);

    if (columnsToCheck.length > 0) {
      for (const col of columnsToCheck) {
        try {
          await queryRunner.query(`
            ALTER TABLE ${col.table_name} 
            ALTER COLUMN ${col.column_name} TYPE numeric(30,8);
          `);
          console.log(`✅ Updated ${col.table_name}.${col.column_name} to numeric(30,8)`);
        } catch (error) {
          console.log(`⚠️  Skipped ${col.table_name}.${col.column_name}: ${error.message}`);
        }
      }
    }

    console.log('🎉 All tables decimal precision migration completed successfully!');
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    console.log('⚠️  Rolling back decimal precision changes...');

    const tables = ['payouts', 'batch_payouts', 'refunds'];
    
    for (const table of tables) {
      const columns = await queryRunner.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = '${table}'
        AND data_type = 'numeric'
        AND numeric_precision = 30
        AND numeric_scale = 8;
      `);

      for (const col of columns) {
        try {
          await queryRunner.query(`
            ALTER TABLE ${table} 
            ALTER COLUMN ${col.column_name} TYPE numeric(15,2);
          `);
        } catch (error) {
          console.log(`⚠️  Could not rollback ${table}.${col.column_name}`);
        }
      }
    }

    console.log('❌ Decimal precision rolled back');
  }
}





