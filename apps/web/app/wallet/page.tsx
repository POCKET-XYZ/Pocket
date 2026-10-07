'use client';

import type { User } from '@pocket/shared';
import {
  ArrowDownToLineIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  RefreshCwIcon,
  WalletIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/page';
import { usePollarSession, type PollarSession } from '@/components/pollar-session';
import { RequireAuth } from '@/components/require-auth';
import { UsdcStatus } from '@/components/usdc-status';
import {
  ReceiveUsdcCard,
  USDC_STATUS_ANCHOR,
} from '@/components/wallet/receive-usdc-card';
import { SendUsdcCard } from '@/components/wallet/send-usdc-card';
import { UsdcHistoryCard } from '@/components/wallet/usdc-history-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useUsdcStatus } from '@/components/usdc-status';

/**
 * What the wallet holds, hidden the way a password field hides itself: someone
 * checking a contract on a shared screen should not have to show their balance
 * to everyone in the room.
 */
function BalanceCard({ pollar }: { pollar: PollarSession }) {
  const [shown, setShown] = useState(false);
  // Load once. The session object changes identity on every balance update, so
  // depending on it would ask Pollar again for the answer it just gave.
  const asked = useRef(false);
  const { refreshBalances } = pollar;

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void refreshBalances();
  }, [refreshBalances]);

  const balances = (pollar.balances ?? []).filter((asset) => asset.balance !== null);
  const usdc = balances.find((asset) => asset.code === 'USDC');
  const rest = balances.filter((asset) => asset !== usdc);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>Balance</CardTitle>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={shown ? 'Hide balance' : 'Show balance'}
            onClick={() => setShown((was) => !was)}
          >
            {shown ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Refresh balance"
            disabled={pollar.balancesLoading}
            onClick={() => void pollar.refreshBalances()}
          >
            <RefreshCwIcon
              className={`size-4 ${pollar.balancesLoading ? 'animate-spin' : ''}`}
            />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        <button
          type="button"
          onClick={() => setShown((was) => !was)}
          className="block text-left"
          title={shown ? 'Click to hide' : 'Click to show'}
        >
          <span className="font-heading text-3xl font-semibold text-navy">
            {pollar.balances === null && pollar.balancesLoading
              ? 'Loading...'
              : shown
                ? `${amount(usdc?.balance)} USDC`
                : '•••••• USDC'}
          </span>
        </button>
        {rest.length > 0 ? (
          <p className="text-sm text-muted-foreground">
            {rest
              .map((asset) => `${shown ? amount(asset.balance) : '••••'} ${asset.code}`)
              .join(' · ')}
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          {shown
            ? 'Click the amount to hide it again.'
            : 'Click the amount to show it. Nobody else sees it either way.'}
        </p>
      </CardContent>
    </Card>
  );
}

/** Two decimals is what people read; the chain keeps all seven. */
function amount(value: string | null | undefined): string {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0.00';
}

/** How the wallet was created, in words the user recognizes. */
const PROVIDER_NAMES: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  email: 'your email',
  passkey: 'a passkey',
  'freighter-native': 'Freighter',
  'albedo-native': 'Albedo',
};

/** What a wallet the user holds has in USDC and in XLM for network fees. */
function WalletBalance() {
  const status = useUsdcStatus();
  if (!status.data || status.data.usdc === 'no_account') return null;
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end justify-between gap-4 pt-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Balance
          </p>
          <p className="font-heading text-3xl font-bold text-navy">
            {status.data.usdcSpendable ?? '0'} <span className="text-lg">USDC</span>
          </p>
        </div>
        {status.data.xlmForFees !== null ? (
          <p className="text-sm text-muted-foreground">
            {Number(status.data.xlmForFees).toFixed(2)} XLM for network fees
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

export default function WalletPage() {
  return (
    <RequireAuth roles={['startup', 'specialist']}>
      {(user) => <WalletView user={user} />}
    </RequireAuth>
  );
}

function WalletView({ user }: { user: User }) {
  const pollar = usePollarSession();
  const throughPollar =
    user.walletCustody === 'pollar' && pollar.ready && pollar.address === user.stellarAddress;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageHeader
        title="Wallet and USDC"
        description="Pocket never holds your funds or keys. Payments move between your wallet and the escrow."
      />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WalletIcon className="size-5 text-navy" />
            Your wallet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {user.walletCustody === 'pollar'
              ? `Created for you when you signed in with ${PROVIDER_NAMES[user.walletProvider ?? ''] ?? 'Pollar'}. You approve every payment from Pocket and the network fees are covered for you.`
              : 'A wallet you hold yourself. Every payment is signed in your wallet.'}
          </p>
          {throughPollar ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={pollar.openReceive}>
                <ArrowDownToLineIcon className="size-4" /> Receive in Pollar
              </Button>
              <Button variant="outline" size="sm" onClick={pollar.openHistory}>
                <HistoryIcon className="size-4" /> History in Pollar
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {throughPollar ? <BalanceCard pollar={pollar} /> : <WalletBalance />}

      <div id={USDC_STATUS_ANCHOR} className="scroll-mt-24 empty:hidden">
        <UsdcStatus user={user} showReady />
      </div>

      <ReceiveUsdcCard address={user.stellarAddress} />

      <SendUsdcCard user={user} />

      {/* No conversion to or from local currency: users bring their own USDC. */}
      <UsdcHistoryCard />
    </div>
  );
}
