import { applyDecorators, SetMetadata } from '@nestjs/common';
import { IS_PUBLIC_KEY } from './public.decorator';

export const OPTIONAL_USER_KEY = 'optionalUser';

/**
 * A public route that still learns who is calling when a valid session comes
 * with the request, so it can show more to the right person. A missing,
 * expired or revoked token is ignored: the caller is treated as anonymous,
 * never refused.
 */
export const OptionalUser = () =>
  applyDecorators(SetMetadata(IS_PUBLIC_KEY, true), SetMetadata(OPTIONAL_USER_KEY, true));
