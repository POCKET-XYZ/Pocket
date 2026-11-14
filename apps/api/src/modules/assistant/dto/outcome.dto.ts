import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** One part of a suggestion, as it ended up in what was posted or delivered. */
export class OutcomePartDto {
  @ApiProperty({ example: 'milestone:0', description: 'title, description, deliverables, milestone:N or kpi:N' })
  @IsString()
  @Matches(/^(title|description|deliverables|note|milestone:\d|kpi:\d{1,2})$/)
  key: string;

  @ApiProperty({ description: 'Whether the person put this part in the form' })
  @IsBoolean()
  used: boolean;

  @ApiPropertyOptional({
    description: 'What the part says in the end, its fields joined one per line',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12_000)
  final?: string;
}

export class OutcomeDto {
  @ApiProperty({ type: [OutcomePartDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => OutcomePartDto)
  parts: OutcomePartDto[];

  @ApiPropertyOptional({ description: 'The job it was posted as' })
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
