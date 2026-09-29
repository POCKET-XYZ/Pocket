import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Opt a route out of the global JWT guard. `@Public(false)` opts a single
 * route back in when its controller is public, like signing out.
 */
export const Public = (isPublic = true) => SetMetadata(IS_PUBLIC_KEY, isPublic);
