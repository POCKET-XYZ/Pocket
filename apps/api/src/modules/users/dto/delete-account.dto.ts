import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/** Deleting an account asks the user to type ELIMINAR, so it is never a misclick. */
export class DeleteAccountDto {
  @ApiProperty({ example: 'ELIMINAR' })
  @Equals('ELIMINAR', { message: 'Escribe ELIMINAR para confirmar' })
  confirm: string;
}
