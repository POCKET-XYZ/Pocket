import type { Metadata } from 'next';
import { previewDescription, publicJob } from '@/lib/job-share';
import { siteOrigin } from '@/lib/site-origin';

/** The line of the card a draft or a broken link gets, the same as its picture. */
const GENERIC = 'Expertos en growth, ventas y marketing para tu startup, con cada pago protegido por hito.';

/**
 * What X, LinkedIn, WhatsApp and the rest show when a job link is shared.
 * The picture is ./opengraph-image.tsx. A draft or an unknown id gets
 * Pocket's own preview, so nothing private leaks into a link card.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [job, origin] = await Promise.all([publicJob(id), siteOrigin()]);
  const base = { metadataBase: new URL(origin) };
  if (!job) {
    return {
      ...base,
      title: 'Trabajo',
      description: GENERIC,
      openGraph: { type: 'website', siteName: 'Pocket', locale: 'es_BO', description: GENERIC },
      twitter: { card: 'summary_large_image', description: GENERIC },
      robots: { index: false, follow: false },
    };
  }
  const title = job.startup ? `${job.title} · ${job.startup.companyName}` : job.title;
  const description = previewDescription(job);
  return {
    ...base,
    title,
    description,
    alternates: { canonical: `/jobs/${job.id}` },
    openGraph: {
      type: 'website',
      siteName: 'Pocket',
      locale: 'es_BO',
      url: `/jobs/${job.id}`,
      title,
      description,
    },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default function JobLayout({ children }: { children: React.ReactNode }) {
  return children;
}
