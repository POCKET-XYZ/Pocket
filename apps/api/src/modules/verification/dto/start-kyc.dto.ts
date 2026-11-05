import { ApiProperty } from '@nestjs/swagger';
import { Equals } from 'class-validator';

/**
 * Starting the identity check asks for express consent to the processing of
 * the document and biometric data (selfie and liveness) by Didit.
 */
export class StartKycDto {
  @ApiProperty({ example: true })
  @Equals(true, { message: 'Necesitamos tu consentimiento para verificar tu identidad' })
  consent: boolean;
}
