import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/links';

/** The landing is one public page: everything may be crawled. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
