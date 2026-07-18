import {
  BaseEntity as TypeOrmBaseEntity,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  VersionColumn,
  Index,
} from 'typeorm';

@Index(['createdAt'])
@Index(['updatedAt'])
export abstract class BaseEntity extends TypeOrmBaseEntity {
  @PrimaryGeneratedColumn('increment', { 
    comment: 'Primary key identifier' 
  })
  id: number;

  @CreateDateColumn({ 
    type: 'timestamptz',
    comment: 'Record creation timestamp',
    default: () => 'CURRENT_TIMESTAMP'
  })
  createdAt: Date;

  @UpdateDateColumn({ 
    type: 'timestamptz',
    comment: 'Record last update timestamp',
    default: () => 'CURRENT_TIMESTAMP'
  })
  updatedAt: Date;

  @DeleteDateColumn({ 
    type: 'timestamptz',
    nullable: true,
    comment: 'Soft delete timestamp'
  })
  deletedAt?: Date;

  @VersionColumn({
    default: 1,
    comment: 'Optimistic locking version'
  })
  version: number;
}
