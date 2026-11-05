import type { ServiceCategory, SocialPlatform, StartupStage } from '@pocket/shared';

/** USDC amounts come from the API as strings to keep their decimals. */
export function usdc(amount: string | number | null | undefined): string {
  if (amount === null || amount === undefined || amount === '') return '-';
  const value = Number(amount);
  return `${value.toLocaleString('en-US', { maximumFractionDigits: 7 })} USDC`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 4)}...${address.slice(-4)}`;
}

/** Calendar dates come as ISO strings at midnight UTC; show them as that day. */
export function date(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** The month of a date, like `mar 2026`. */
export function month(value: string): string {
  return new Date(value).toLocaleDateString('es', {
    year: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

export function dateTime(value: string | null | undefined): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('es', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

/** A share as a whole percent, or `-` when there is nothing to count. */
export function percent(part: number, total: number): string {
  return total > 0 ? `${Math.round((part / total) * 100)} %` : '-';
}

/** Today in UTC as YYYY-MM-DD, the minimum for date inputs. */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** The calendar day `days` from today, as `YYYY-MM-DD`. */
export function isoInDays(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  growth: 'Growth',
  sales: 'Ventas',
  marketing: 'Marketing',
  digital_marketing: 'Marketing digital',
  content: 'Contenido e influencers',
};

export const PLATFORM_LABELS: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  youtube: 'YouTube',
  x: 'X',
  linkedin: 'LinkedIn',
  facebook: 'Facebook',
  twitch: 'Twitch',
  other: 'Otra',
};

export const STAGE_LABELS: Record<StartupStage, string> = {
  idea: 'Idea',
  pre_seed: 'Pre-seed',
  seed: 'Seed',
  series_a: 'Serie A',
  series_b_plus: 'Serie B+',
};

/** Link to a transaction on the Stellar explorer of the configured network. */
export function explorerTx(hash: string): string {
  const network =
    process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/tx/${hash}`;
}

export function explorerContract(contractId: string): string {
  const network =
    process.env.NEXT_PUBLIC_STELLAR_NETWORK === 'mainnet' ? 'public' : 'testnet';
  return `https://stellar.expert/explorer/${network}/contract/${contractId}`;
}
