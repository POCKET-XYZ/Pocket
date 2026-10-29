import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ImageResponse } from 'next/og';

// The preview shown when the landing is shared (WhatsApp, LinkedIn, X, Slack).
export const alt = 'Pocket: tu equipo de growth, sin miedo a contratar';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const fonts = join(process.cwd(), 'node_modules/@fontsource/fredoka/files');

export default async function Image() {
  const [bold, medium, pocket] = await Promise.all([
    readFile(join(fonts, 'fredoka-latin-700-normal.woff')),
    readFile(join(fonts, 'fredoka-latin-500-normal.woff')),
    readFile(join(process.cwd(), 'assets/og-pocket.png')),
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
        fontFamily: 'Fredoka',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', width: 660 }}>
        <div style={{ fontSize: 44, fontWeight: 700 }}>Pocket</div>
        <div
          style={{
            marginTop: 48,
            fontSize: 76,
            fontWeight: 700,
            lineHeight: 1.02,
            letterSpacing: '-0.01em',
          }}
        >
          Tu equipo de growth, sin miedo a contratar.
        </div>
        <div style={{ marginTop: 32, fontSize: 32, fontWeight: 500, color: '#86d4e6' }}>
          Solo pagas cuando apruebas el trabajo.
        </div>
      </div>
      <img
        src={`data:image/png;base64,${pocket.toString('base64')}`}
        width={400}
        height={400}
        alt=""
      />
    </div>,
    {
      ...size,
      fonts: [
        { name: 'Fredoka', data: bold, weight: 700, style: 'normal' },
        { name: 'Fredoka', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}
