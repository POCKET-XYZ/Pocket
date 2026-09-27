'use client';

import type { User } from '@pocket/shared';
import {
  ArrowDownToLineIcon,
  ArrowLeftRightIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  HistoryIcon,
  RefreshCwIcon,
  WalletIcon,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page';
import { usePollarSession, type PollarSession } from '@/components/pollar-session';
import { RequireAuth } from '@/components/require-auth';
import { UsdcStatus } from '@/components/usdc-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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

  async function copyAddress() {
    await navigator.clipboard.writeText(user.stellarAddress);
    toast.success('Address copied');
  }

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
          <p className="break-all font-mono text-sm">{user.stellarAddress}</p>
          <p className="text-sm text-muted-foreground">
            {user.walletCustody === 'pollar'
              ? `Created for you when you signed in with ${PROVIDER_NAMES[user.walletProvider ?? ''] ?? 'Pollar'}. You approve every payment from Pocket and the network fees are covered for you.`
              : 'A wallet you hold yourself. Every payment is signed in your wallet.'}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={copyAddress}>
              <CopyIcon className="size-4" /> Copy address
            </Button>
            {throughPollar ? (
              <>
                <Button variant="outline" size="sm" onClick={pollar.openBalance}>
                  Balances
                </Button>
                <Button variant="outline" size="sm" onClick={pollar.openReceive}>
                  <ArrowDownToLineIcon className="size-4" /> Receive
                </Button>
                <Button variant="outline" size="sm" onClick={pollar.openHistory}>
                  <HistoryIcon className="size-4" /> History
                </Button>
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {throughPollar ? <BalanceCard pollar={pollar} /> : null}

      <UsdcStatus user={user} showReady />

      {throughPollar ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRightIcon className="size-5 text-navy" />
              Money in and out
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Turn local currency into the USDC you pay with, or cash out what you earned
              to your bank account. The rails available depend on your country.
            </p>
            <Button variant="outline" size="sm" onClick={pollar.openRamp}>
              Deposit or withdraw
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
