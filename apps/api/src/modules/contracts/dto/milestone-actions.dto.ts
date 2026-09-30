import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length } from 'class-validator';
import { IsHttpsUrl } from '../../../common/decorators/is-https-url.decorator';

/** A specialist's submission for a milestone: a link to the work and a note. */
export class DeliverDto {
  @ApiProperty({ description: 'Link to the document, folder, report or campaign' })
  @IsHttpsUrl()
  url: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 2000)
  note?: string;
}

export class RequestChangesDto {
  @ApiProperty({ description: 'What the specialist should change' })
  @IsString()
  @Length(5, 2000)
  feedback: string;
}
