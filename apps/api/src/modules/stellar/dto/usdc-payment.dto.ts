import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** USDC the user wants to send from their wallet to another Stellar account. */
export class UsdcPaymentDto {
  @ApiProperty({ description: 'Stellar account that receives the USDC (G...)' })
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'destination must be a Stellar address (G...)' })
  destination: string;

  @ApiProperty({ description: 'Amount in USDC, up to 7 decimals', example: '25.50' })
  @IsString()
  @Matches(/^\d{1,12}(\.\d{1,7})?$/, {
    message: 'amount must be a number with up to 7 decimals',
  })
  amount: string;

  @ApiPropertyOptional({ description: 'Text memo, up to 28 bytes' })
  @IsOptional()
  @IsString()
  @MaxLength(28)
  memo?: string;
}
