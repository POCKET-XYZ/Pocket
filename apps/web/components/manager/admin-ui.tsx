'use client';

import type { AdminFlag } from '@pocket/shared';
import { ExternalLinkIcon, SearchIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { shortAddress } from '@/lib/format';
import { cn } from '@/lib/utils';

/** What each flag means, in the words the admin reads, and how loud it is. */
export const FLAGS: Record<
  AdminFlag,
  { label: string; tone: 'danger' | 'warning' | 'info' }
> = {
  dispute: { label: 'Disputa abierta', tone: 'danger' },
  failed_step: { label: 'Paso fallido', tone: 'danger' },
  overdue: { label: 'Hito vencido', tone: 'warning' },
  awaiting_funding: { label: 'Falta el depósito', tone: 'warning' },
  to_review: { label: 'Entrega por revisar', tone: 'info' },
  unread_payment: { label: 'Pago sin leer', tone: 'info' },
};

const TONES = {
  danger: 'bg-red-100 text-red-800',
  warning: 'bg-warning/40 text-navy',
  info: 'bg-celeste-light text-navy',
};

export function FlagBadge({ flag }: { flag: AdminFlag }) {
  const { label, tone } = FLAGS[flag];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium',
        TONES[tone],
      )}
    >
      {label}
    </span>
  );
}

/** A row of filters, each with how many items it holds. */
export function FilterTabs<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count: number }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition',
            option.value === value
              ? 'border-navy bg-navy text-off-white'
              : 'border-border bg-card text-navy hover:border-celeste',
          )}
        >
          {option.label}
          <span
            className={cn(
              'rounded-full px-1.5 text-xs tabular-nums',
              option.value === value ? 'bg-white/15' : 'bg-muted text-muted-foreground',
            )}
          >
            {option.count}
          </span>
        </button>
      ))}
    </div>
  );
}

export function SearchBox({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative w-full md:w-72">
      <SearchIcon
        className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
      <Input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="pl-9"
      />
    </div>
  );
}

/** Whether a row's words contain every word searched, ignoring accents and case. */
export function matches(words: (string | null | undefined)[], query: string): boolean {
  const plain = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const haystack = plain(words.filter(Boolean).join(' '));
  return plain(query)
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

/** An address shortened, linking to it on the explorer. */
export function ChainLink({ href, address }: { href: string; address: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={address}
      className="inline-flex items-center gap-1 font-mono text-xs text-navy underline-offset-2 hover:underline"
    >
      {shortAddress(address)}
      <ExternalLinkIcon className="size-3" aria-hidden />
    </a>
  );
}

/** An amount rounded to cents, with thousands separators. */
export function short(amount: string | number): string {
  return Number(amount).toLocaleString('en-US', { maximumFractionDigits: 2 });
}

/** A date as a short day, in the reader's calendar. */
export function shortDay(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/** How long ago, in the largest unit that fits. */
export function ago(value: string, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(value).getTime()) / 60_000));
  if (minutes < 60) return minutes <= 1 ? 'hace un momento' : `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} días`;
}
