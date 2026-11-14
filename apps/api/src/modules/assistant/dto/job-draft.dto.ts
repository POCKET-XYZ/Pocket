import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ServiceCategory } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  ValidateNested,
} from 'class-validator';

/** The longest text the assistant reads, as the screen's counter shows. */
export const MAX_REQUEST_CHARS = 4_000;

export class FollowUpDto {
  @ApiProperty({ description: 'The questions the assistant asked, as it asked them' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @IsString({ each: true })
  @MaxLength(300, { each: true })
  questions: string[];

  @ApiProperty({ description: "The company's answers, in its own words" })
  @IsString()
  @Length(1, 2_000)
  answers: string;
}

export class JobDraftDto {
  @ApiProperty({ description: 'What the company needs, in its own words' })
  @IsString()
  @Length(10, MAX_REQUEST_CHARS, {
    message: `Escribe entre 10 y ${MAX_REQUEST_CHARS} caracteres`,
  })
  text: string;

  @ApiPropertyOptional({ enum: ServiceCategory })
  @IsOptional()
  @IsEnum(ServiceCategory)
  category?: ServiceCategory;

  @ApiPropertyOptional({ description: 'The one round of questions, with the answers' })
  @IsOptional()
  @ValidateNested()
  @Type(() => FollowUpDto)
  followUp?: FollowUpDto;

  @ApiPropertyOptional({ description: 'The draft being edited, if any' })
  @IsOptional()
  @IsUUID()
  jobId?: string;
}
