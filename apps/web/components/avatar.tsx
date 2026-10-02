import { imageSrc } from '@/lib/links';

/**
 * A startup's logo, or the first letter of the name when there is none. People
 * have no photo on Pocket, so for them it is always the letter.
 */
export function Avatar({
  name,
  url,
  size = 48,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const src = imageSrc(url);
  if (src) {
    // Logos are arbitrary links, so a plain img avoids next/image domain rules.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full border border-border bg-white object-contain"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-navy font-heading font-semibold text-yellow"
      style={{ width: size, height: size }}
    >
      {name.slice(0, 1).toUpperCase()}
    </div>
  );
}
