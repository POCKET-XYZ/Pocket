import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/** Deleting an account asks the user to type DELETE, so it is never a misclick. */
export class DeleteAccountDto {
  @ApiProperty({ example: 'DELETE' })
  @Equals('DELETE', { message: 'Type DELETE to confirm' })
  confirm: string;
}
