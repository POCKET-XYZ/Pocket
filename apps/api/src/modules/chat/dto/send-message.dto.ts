import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsString, Length } from 'class-validator';

export class SendMessageDto {
  @ApiProperty({ example: 'Hola, ¿el video lleva subtítulos en inglés también?' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 2000, { message: 'Escribe un mensaje de hasta 2000 caracteres' })
  body: string;
}
