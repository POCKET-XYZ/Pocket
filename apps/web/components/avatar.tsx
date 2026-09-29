import { safeHref } from '@/lib/links';

/** A profile photo, or the first letter of the name when there is none. */
export function Avatar({
  name,
  url,
  size = 48,
}: {
  name: string;
  url?: string | null;
  size?: number;
}) {
  const src = safeHref(url);
  if (src) {
    // Profile photos are arbitrary links, so a plain img avoids next/image domain rules.
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
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
