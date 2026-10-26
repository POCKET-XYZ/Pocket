/** Where the product (apps/web) lives; set NEXT_PUBLIC_APP_URL per deploy. */
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';

export const links = {
  login: `${APP_URL}/login`,
};
