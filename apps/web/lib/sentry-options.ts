/**
 * Error reporting settings shared by the browser and the server. Errors
 * only: no session replay, no performance tracing. Without
 * NEXT_PUBLIC_SENTRY_DSN (locally) it stays off.
 */
import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs';

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

/** The address without its query string or fragment (sign-in callbacks carry codes there). */
function bare(url: unknown): unknown {
  return typeof url === 'string' ? url.replace(/[?#].*$/, '') : url;
}

export const sentryOptions = {
  dsn,
  enabled: Boolean(dsn),
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
  // Collect only what explains an error: no bodies, cookies, user details,
  // query strings or local variables (they can hold tokens or signed
  // transactions).
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: { request: { allow: ['user-agent'] }, response: false },
    httpBodies: [],
    urlQueryParams: false,
    stackFrameVariables: false,
  },
  beforeSend(event: ErrorEvent) {
    if (event.request) {
      event.request.url = bare(event.request.url) as string | undefined;
      delete event.request.query_string;
      delete event.request.cookies;
      delete event.request.data;
    }
    return event;
  },
  beforeBreadcrumb(breadcrumb: Breadcrumb) {
    const data = breadcrumb.data;
    if (data) for (const key of ['url', 'from', 'to']) if (key in data) data[key] = bare(data[key]);
    return breadcrumb;
  },
};
