import { IsString, IsOptional, IsEnum, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum RefundAction {
  APPROVE = 'approve',
  REJECT = 'reject'
}

export class ApproveRefundDto {
  @ApiProperty({
    example: 'approve',
    description: 'Action to take on refund',
    enum: RefundAction
  })
  @IsEnum(RefundAction)
  action: RefundAction;

  @ApiPropertyOptional({
    example: 'Approved by admin after verification',
    description: 'Approval/rejection notes',
    maxLength: 500
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;

  @ApiProperty({
    example: 'admin_user@valorapays.com',
    description: 'Admin user approving/rejecting',
    maxLength: 100
  })
  @IsString()
  @MaxLength(100)
  approvedBy: string;
}



