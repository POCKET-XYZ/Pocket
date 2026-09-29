import { applyDecorators } from '@nestjs/common';
import { IsUrl, MaxLength } from 'class-validator';

/**
 * A link other users will open. Only https: a javascript:, data: or file:
 * link, or a plain http one, would run or be tampered with in their browser.
 */
export const IsHttpsUrl = () =>
  applyDecorators(
    IsUrl(
      { protocols: ['https'], require_protocol: true, require_valid_protocol: true },
      { message: '$property must be an https:// link' },
    ),
    MaxLength(2048),
  );
