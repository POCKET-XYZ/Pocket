import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The preview shown when the landing is shared (WhatsApp, LinkedIn, X, Slack).
export const alt = 'Pocket: crece más rápido, paga seguro. Talento para startups latinas';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const fonts = join(process.cwd(), 'node_modules/@fontsource/figtree/files');

export default async function Image() {
  const [extraBold, medium, pocket, logo] = await Promise.all([
    readFile(join(fonts, 'figtree-latin-800-normal.woff')),
    readFile(join(fonts, 'figtree-latin-500-normal.woff')),
    readFile(join(process.cwd(), 'public/brand/p-3d-celeste-480.png')),
    readFile(join(process.cwd(), 'public/brand/logo-white.svg')),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '72px 80px',
        background: '#0f2e52',
        color: '#f4fbfd',
        fontFamily: 'Figtree',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 660 }}>
        <img
          src={`data:image/svg+xml;base64,${logo.toString('base64')}`}
          width={198}
          height={48}
          alt="Pocket"
        />
        <div
          style={{
            marginTop: 48,
            fontSize: 76,
            fontWeight: 800,
            lineHeight: 1.02,
            letterSpacing: '-0.01em',
          }}
        >
          Crece más rápido. Paga seguro.
        </div>
        <div style={{ marginTop: 32, fontSize: 32, fontWeight: 500, color: '#86d4e6' }}>
          Talento para startups latinas
        </div>
      </div>
      <img
        src={`data:image/png;base64,${pocket.toString('base64')}`}
        width={316}
        height={400}
        alt=""
      />
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Figtree', data: extraBold, weight: 800, style: 'normal' },
        { name: 'Figtree', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}
