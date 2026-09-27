'use client';

import type { User } from '@pocket/shared';
import {
  ArrowDownToLineIcon,
  ArrowLeftRightIcon,
  CopyIcon,
  HistoryIcon,
  WalletIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/page';
import { usePollarSession } from '@/components/pollar-session';
import { RequireAuth } from '@/components/require-auth';
import { UsdcStatus } from '@/components/usdc-status';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
