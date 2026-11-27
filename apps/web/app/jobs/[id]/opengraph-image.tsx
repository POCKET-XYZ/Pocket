import type { JobListing } from '@pocket/shared';
import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CATEGORY_LABELS, date, usdc } from '@/lib/format';
import { hirer, publicJob } from '@/lib/job-share';
import { siteOrigin } from '@/lib/site-origin';

/** The picture a shared job link shows on X, LinkedIn, WhatsApp and the rest. */
export const alt = 'Un trabajo publicado en Pocket';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Brand tokens, the same as app/globals.css.
const NAVY = '#0f2e52';
const CELESTE = '#86d4e6';
const CELESTE_LIGHT = '#b8e7f1';
const MANDARINA = '#ff9f45';
const OFF_WHITE = '#f4fbfd';

// Read once per server instance. The fonts are OFL (assets/fonts/OFL-*.txt).
const assets = Promise.all([
  readFile(join(process.cwd(), 'assets/fonts/Figtree-ExtraBold.ttf')),
  readFile(join(process.cwd(), 'assets/fonts/Figtree-Bold.ttf')),
  readFile(join(process.cwd(), 'assets/fonts/Inter-Medium.ttf')),
  readFile(join(process.cwd(), 'public/brand/logo-white.svg'), 'base64'),
]);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [[extraBold, bold, medium, logo], job, origin] = await Promise.all([
    assets,
    publicJob(id),
    siteOrigin(),
  ]);
  const host = new URL(origin).host;
  const brand = `data:image/svg+xml;base64,${logo}`;
  const startupLogo = job?.startup?.logoUrl ? await inlineLogo(job.startup.logoUrl) : null;

  return new ImageResponse(
    job ? (
      <JobCard job={job} brand={brand} host={host} startupLogo={startupLogo} />
    ) : (
      <PocketCard brand={brand} host={host} />
    ),
    {
      ...size,
      fonts: [
        { name: 'Figtree', data: extraBold, weight: 800, style: 'normal' },
        { name: 'Figtree', data: bold, weight: 700, style: 'normal' },
        { name: 'Inter', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}

function JobCard({
  job,
  brand,
  host,
  startupLogo,
}: {
  job: JobListing;
  brand: string;
  host: string;
  startupLogo: string | null;
}) {
  const title = job.title.length > 110 ? `${job.title.slice(0, 107).trimEnd()}…` : job.title;
  const titleSize = title.length <= 45 ? 68 : title.length <= 80 ? 56 : 48;
  const company = hirer(job);
  return (
    <div style={frame}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={brand} width={215} height={52} alt="" />
        <div
          style={{
            display: 'flex',
            background: job.status === 'open' ? CELESTE_LIGHT : 'rgba(244,251,253,0.15)',
            color: job.status === 'open' ? NAVY : OFF_WHITE,
            borderRadius: 999,
            padding: '10px 24px',
            fontFamily: 'Figtree',
            fontWeight: 700,
            fontSize: 24,
          }}
        >
          {job.status === 'open' ? 'Recibe postulaciones' : 'Ya no recibe postulaciones'}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, justifyContent: 'center' }}>
        <div
          style={{
            color: MANDARINA,
            fontFamily: 'Figtree',
            fontWeight: 700,
            fontSize: 26,
            letterSpacing: 2,
            textTransform: 'uppercase',
          }}
        >
          {CATEGORY_LABELS[job.category]}
        </div>
        <div
          style={{
            marginTop: 14,
            fontFamily: 'Figtree',
            fontWeight: 800,
            fontSize: titleSize,
            lineHeight: 1.1,
          }}
        >
          {title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 28 }}>
          {startupLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={startupLogo}
              width={60}
              height={60}
              alt=""
              style={{ borderRadius: 14, objectFit: 'cover', background: OFF_WHITE }}
            />
          ) : (
            <div
              style={{
                display: 'flex',
                width: 60,
                height: 60,
                borderRadius: 14,
                alignItems: 'center',
                justifyContent: 'center',
                background: CELESTE,
                color: NAVY,
                fontFamily: 'Figtree',
                fontWeight: 800,
                fontSize: 26,
              }}
            >
              {initials(company)}
            </div>
          )}
          <div style={{ marginLeft: 18, fontSize: 30 }}>{company}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-end' }}>
        <Fact label="Presupuesto" value={usdc(job.budget)} />
        <Fact label="Entrega" value={date(job.deadline)} />
        <Fact label="Pago" value="Protegido por hito" />
        <div style={{ marginLeft: 'auto', color: CELESTE, fontSize: 22 }}>{host}</div>
      </div>
    </div>
  );
}

/** For a link that is no longer public (a draft, a wrong id): just Pocket. */
function PocketCard({ brand, host }: { brand: string; host: string }) {
  return (
    <div style={{ ...frame, alignItems: 'center', justifyContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={brand} width={430} height={104} alt="" />
      <div
        style={{
          marginTop: 36,
          fontFamily: 'Figtree',
          fontWeight: 700,
          fontSize: 40,
          textAlign: 'center',
        }}
      >
        Expertos en growth, ventas y marketing para tu empresa
      </div>
      <div style={{ marginTop: 24, color: CELESTE, fontSize: 24 }}>{host}</div>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        marginRight: 16,
        padding: '16px 24px',
        borderRadius: 18,
        background: 'rgba(244,251,253,0.08)',
      }}
    >
      <div style={{ color: CELESTE, fontSize: 20 }}>{label}</div>
      <div style={{ marginTop: 4, fontFamily: 'Figtree', fontWeight: 700, fontSize: 30 }}>
        {value}
      </div>
    </div>
  );
}

const frame: React.CSSProperties = {
  width: '100%',
  height: '100%',
  display: 'flex',
  flexDirection: 'column',
  // Extra room at the bottom: X lays the title over the lower left corner.
  padding: '56px 64px 84px',
  background: NAVY,
  color: OFF_WHITE,
  fontFamily: 'Inter',
};

function initials(name: string): string {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '');
  return letters.join('') || 'P';
}

/**
 * The startup's logo as a data URI, or null to draw its initials instead.
 * Only PNG and JPEG: the image renderer cannot draw WebP, and a logo that is
 * slow or missing must not cost the whole preview.
 */
async function inlineLogo(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(3000) });
    if (!response.ok) return null;
    const type = response.headers.get('content-type')?.split(';')[0].trim();
    if (type !== 'image/png' && type !== 'image/jpeg') return null;
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length > 2_000_000) return null;
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch {
    return null;
  }
}
