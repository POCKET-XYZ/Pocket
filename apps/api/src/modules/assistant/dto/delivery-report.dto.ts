import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID, Length } from 'class-validator';
import { MAX_REQUEST_CHARS } from './job-draft.dto';

export class DeliveryReportDto {
  @ApiProperty({ description: 'The milestone being delivered' })
  @IsUUID()
  milestoneId: string;

  @ApiProperty({ description: "The expert's notes, in their own words" })
  @IsString()
  @Length(10, MAX_REQUEST_CHARS, {
    message: `Escribe entre 10 y ${MAX_REQUEST_CHARS} caracteres`,
  })
  notes: string;
}
