import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

/** PUT /users/me/startup */
export class ActiveStartupDto {
  @ApiProperty({ description: 'One of the startups the account owns' })
  @IsUUID('all', { message: 'Elige una de tus empresas' })
  startupId: string;
}
