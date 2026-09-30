import * as Sentry from '@sentry/nestjs';

/**
 * Error reporting. It loads before anything else so Sentry can hook into the
 * libraries it watches. Errors only: no performance tracing, no profiling.
 * Without SENTRY_DSN (locally, in tests) it stays off.
 */
const dsn = process.env.SENTRY_DSN;

Sentry.init({
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV ?? 'development',
  // Collect only what explains an error: no bodies (signed transactions,
  // verification data), no cookies or headers, no user details, no query
  // data and no local variables (they can hold keys or tokens).
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ['user-agent', 'content-type'] }, response: false },
    httpBodies: [],
    urlQueryParams: false,
    databaseQueryData: false,
    queues: false,
    stackFrameVariables: false,
  },
  beforeSend(event) {
    // A second guard in case a future SDK collects more by default.
    const request = event.request;
    if (request) {
      delete request.data;
      delete request.cookies;
      if (request.headers) {
        for (const name of Object.keys(request.headers)) {
          if (/^(authorization|cookie|x-api-key)$/i.test(name)) delete request.headers[name];
        }
      }
    }
    return event;
  },
});
