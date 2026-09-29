import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { DisputeOutcome, DisputeStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBase64,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsHttpsUrl } from '../../../common/decorators/is-https-url.decorator';

/** The signed dispute transaction, with why the party is opening it. */
export class OpenDisputeDto {
  @ApiProperty({ description: 'Signed transaction envelope, base64 XDR' })
  @IsString()
  @IsBase64()
  @MaxLength(20_000)
  signedXdr: string;

  @ApiProperty()
  @IsString()
  @Length(10, 2000)
  reason: string;
}

export class AddEvidenceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsHttpsUrl()
  url?: string;

  @ApiProperty()
  @IsString()
  @Length(2, 2000)
  comment: string;
}

/** A manager's decision on a disputed milestone. */
export class ResolveDisputeDto {
  @ApiProperty({ enum: DisputeOutcome })
  @IsEnum(DisputeOutcome)
  outcome: DisputeOutcome;

  @ApiPropertyOptional({
    description: 'Split only: USDC the specialist receives. The startup gets the rest',
  })
  @ValidateIf((dto: ResolveDisputeDto) => dto.outcome === 'split')
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 7 })
  @Min(0)
  specialistAmount?: number;

  @ApiProperty({ description: 'Why the manager decided this. Both parties see it' })
  @IsString()
  @Length(10, 2000)
  note: string;
}

export class ListDisputesDto {
  @ApiPropertyOptional({ enum: DisputeStatus, default: DisputeStatus.open })
  @IsOptional()
  @IsEnum(DisputeStatus)
  status?: DisputeStatus;
}
