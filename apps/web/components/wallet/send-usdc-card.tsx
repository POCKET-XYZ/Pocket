'use client';

import type { User, UsdcPaymentResult } from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { SendIcon, TriangleAlertIcon } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/form';
import { usePollarSession } from '@/components/pollar-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useSigner } from '@/components/use-signer';
import { useUsdcStatus } from '@/components/usdc-status';
import { USDC_PAYMENTS_KEY } from '@/components/wallet/usdc-history-card';
import { api, errorMessage } from '@/lib/api';
import { explorerTx, shortAddress } from '@/lib/format';
import {
  MAX_MEMO_BYTES,
  memoBytes,
  normalizeDraft,
  sendProblems,
  type SendDraft,
  type SendProblems,
} from '@/lib/send-usdc';
import { fromUnits, toUnits } from '@/lib/usdc';
import { isWalletDismissed, type PreparedTransaction } from '@/lib/wallet';

const EMPTY: SendDraft = { destination: '', amount: '', memo: '' };

/**
 * A prepared payment expires five minutes after the API builds it. Past this,
 * a fresh one is prepared before asking for the signature.
 */
const PREPARED_FOR_MS = 4 * 60 * 1000;

interface Review {
  draft: SendDraft;
  prepared: PreparedTransaction;
  preparedAt: number;
}

/** Ask the API for the payment transaction. It checks everything again. */
async function preparePayment(draft: SendDraft): Promise<Review> {
  const prepared = await api<PreparedTransaction>('/wallet/usdc-payment/prepare', {
    method: 'POST',
    body: {
      destination: draft.destination,
      amount: draft.amount,
      ...(draft.memo ? { memo: draft.memo } : {}),
    },
  });
  return { draft, prepared, preparedAt: Date.now() };
}

/**
 * Sends USDC from the user's wallet to another Stellar address. The form is
 * checked here, the API checks it again against the network and builds the
 * transaction, the user confirms the exact payment, and only a transaction
 * that matches what they confirmed reaches their wallet for a signature.
 */
export function SendUsdcCard({ user }: { user: User }) {
  const queryClient = useQueryClient();
  const status = useUsdcStatus();
  const signer = useSigner();
  const pollar = usePollarSession();
  const [draft, setDraft] = useState<SendDraft>(EMPTY);
  const [problems, setProblems] = useState<SendProblems>({});
  const [review, setReview] = useState<Review | null>(null);

  const spendable = status.data?.usdcSpendable ?? null;
  const ready = status.data?.usdc === 'ready';

  const prepare = useMutation({
    mutationFn: preparePayment,
    onSuccess: setReview,
    onError: (error) => toast.error(errorMessage(error)),
  });

  const send = useMutation({
    mutationFn: async (current: Review): Promise<UsdcPaymentResult> => {
      const fresh =
        Date.now() - current.preparedAt > PREPARED_FOR_MS
          ? await preparePayment(current.draft)
          : current;
      const signedXdr = await signer.sign(
        fresh.prepared.xdr,
        fresh.prepared.networkPassphrase,
        { kind: 'usdc-payment', ...fresh.draft },
      );
      return api<UsdcPaymentResult>('/wallet/usdc-payment/submit', {
        method: 'POST',
        body: { signedXdr },
      });
    },
    onSuccess: async (result) => {
      setReview(null);
      setDraft(EMPTY);
      toast.success(`Sent ${fromUnits(toUnits(result.amount))} USDC`, {
        description: (
          <a
            className="underline"
            href={explorerTx(result.txHash)}
            target="_blank"
            rel="noreferrer"
          >
            View the transaction on the explorer
          </a>
        ),
      });
      if (pollar.ready && pollar.address === user.stellarAddress) {
        void pollar.refreshBalances();
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['wallet', 'usdc'] }),
        queryClient.invalidateQueries({ queryKey: USDC_PAYMENTS_KEY }),
      ]);
    },
    onError: (error) => {
      if (!isWalletDismissed(error)) toast.error(errorMessage(error));
    },
  });

  function update(field: keyof SendDraft, value: string) {
    setDraft((current) => ({ ...current, [field]: value }));
    setProblems((current) => ({ ...current, [field]: undefined }));
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = sendProblems(draft, user.stellarAddress, spendable);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    prepare.mutate(normalizeDraft(draft));
  }

  const memoSize = memoBytes(draft.memo.trim());
  const busy = prepare.isPending || send.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SendIcon className="size-5 text-navy" />
          Send USDC
        </CardTitle>
      </CardHeader>
      <CardContent>
        {!status.data ? (
          <p className="text-sm text-muted-foreground">Checking your wallet...</p>
        ) : !ready ? (
          <p className="text-sm text-muted-foreground">
            Enable USDC in your wallet before sending it.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={onSubmit} noValidate>
            <Field label="Send to" htmlFor="send-destination" required>
              <Input
                id="send-destination"
                value={draft.destination}
                onChange={(event) => update('destination', event.target.value)}
                placeholder="G..."
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                aria-invalid={Boolean(problems.destination)}
              />
              <Problem text={problems.destination} />
            </Field>

            <Field label="Amount (USDC)" htmlFor="send-amount" required>
              <div className="flex gap-2">
                <Input
                  id="send-amount"
                  value={draft.amount}
                  onChange={(event) => update('amount', event.target.value)}
                  inputMode="decimal"
                  placeholder="0.00"
                  autoComplete="off"
                  aria-invalid={Boolean(problems.amount)}
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={!spendable || toUnits(spendable) <= BigInt(0)}
                  onClick={() =>
                    spendable && update('amount', fromUnits(toUnits(spendable)))
                  }
                >
                  Max
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Available: {spendable ? fromUnits(toUnits(spendable)) : '0'} USDC
              </p>
              <Problem text={problems.amount} />
            </Field>

            <Field label="Memo (optional)" htmlFor="send-memo">
              <Input
                id="send-memo"
                value={draft.memo}
                onChange={(event) => update('memo', event.target.value)}
                autoComplete="off"
                aria-invalid={Boolean(problems.memo)}
              />
              <p className="text-xs text-muted-foreground">
                Sending to an exchange? It usually requires a memo to know the deposit is
                yours. Copy it exactly as the exchange shows it. Up to {MAX_MEMO_BYTES}{' '}
                bytes ({memoSize}/{MAX_MEMO_BYTES}).
              </p>
              <Problem text={problems.memo} />
            </Field>

            <p className="text-xs text-muted-foreground">
              {user.walletCustody === 'pollar'
                ? 'The network fee is covered for you.'
                : 'Your wallet pays a small network fee in XLM.'}
            </p>

            <Button type="submit" disabled={busy}>
              {prepare.isPending ? 'Checking...' : 'Review payment'}
            </Button>
          </form>
        )}
      </CardContent>

      <Dialog
        open={review !== null}
        onOpenChange={(open) => {
          if (!open && !send.isPending) setReview(null);
        }}
      >
        {review ? (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Confirm payment</DialogTitle>
              <DialogDescription>
                Check every detail. You will approve it in your wallet next.
              </DialogDescription>
            </DialogHeader>

            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground">Amount</dt>
                <dd className="font-heading text-2xl font-semibold text-navy">
                  {review.draft.amount} USDC
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">To</dt>
                <dd className="font-mono font-medium">
                  {shortAddress(review.draft.destination)}
                </dd>
                <dd className="mt-1 font-mono text-xs break-all text-muted-foreground">
                  {review.draft.destination}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Memo</dt>
                <dd className="break-all">
                  {review.draft.memo ? (
                    <span className="font-mono">{review.draft.memo}</span>
                  ) : (
                    'No memo'
                  )}
                </dd>
              </div>
            </dl>

            <div className="flex gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0 text-destructive" />
              <p>
                This payment cannot be undone. USDC sent to a wrong address, or to an
                exchange without its memo, may be lost for good.
              </p>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                disabled={send.isPending}
                onClick={() => setReview(null)}
              >
                Cancel
              </Button>
              <Button disabled={send.isPending} onClick={() => send.mutate(review)}>
                {send.isPending ? 'Sending...' : `Send ${review.draft.amount} USDC`}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </Card>
  );
}

function Problem({ text }: { text: string | undefined }) {
  return text ? <p className="text-xs text-destructive">{text}</p> : null;
}
