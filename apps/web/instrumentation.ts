import * as Sentry from '@sentry/nextjs';
import { sentryOptions } from '@/lib/sentry-options';

export function register() {
  Sentry.init(sentryOptions);
}

/** Errors thrown while rendering on the server. */
export const onRequestError = Sentry.captureRequestError;
