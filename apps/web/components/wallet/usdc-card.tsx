'use client';

import type { User } from '@pocket/shared';
import { ArrowDownToLineIcon, SendIcon } from 'lucide-react';
import { useState } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ReceiveUsdcPanel } from '@/components/wallet/receive-usdc-card';
import { SendUsdcPanel } from '@/components/wallet/send-usdc-card';
import { cn } from '@/lib/utils';

type Tab = 'receive' | 'send';

const TABS: { value: Tab; label: string; icon: typeof SendIcon }[] = [
  { value: 'receive', label: 'Recibir', icon: ArrowDownToLineIcon },
  { value: 'send', label: 'Enviar', icon: SendIcon },
];

/**
 * Receiving and sending USDC in one card, one tab each, like a swap. Both
 * stay mounted, so a payment half typed is still there after a look at the
 * address.
 */
export function UsdcCard({ user }: { user: User }) {
  const [tab, setTab] = useState<Tab>('receive');
  return (
    <Card>
      <CardHeader>
        <div
          role="tablist"
          aria-label="Recibir o enviar USDC"
          className="grid grid-cols-2 gap-1 rounded-xl bg-muted p-1"
        >
          {TABS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              type="button"
              role="tab"
              id={`usdc-tab-${value}`}
              aria-selected={tab === value}
              aria-controls={`usdc-panel-${value}`}
              onClick={() => setTab(value)}
              className={cn(
                'flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition',
                tab === value
                  ? 'bg-card text-navy shadow-sm'
                  : 'text-muted-foreground hover:text-navy',
              )}
            >
              <Icon className="size-4" />
              {label} USDC
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        <div
          role="tabpanel"
          id="usdc-panel-receive"
          aria-labelledby="usdc-tab-receive"
          hidden={tab !== 'receive'}
        >
          <ReceiveUsdcPanel
            address={user.stellarAddress}
            throughPollar={user.walletCustody === 'pollar'}
          />
        </div>
        <div
          role="tabpanel"
          id="usdc-panel-send"
          aria-labelledby="usdc-tab-send"
          hidden={tab !== 'send'}
        >
          <SendUsdcPanel user={user} />
        </div>
      </CardContent>
    </Card>
  );
}
