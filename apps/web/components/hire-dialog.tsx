'use client';

import {
  TRUSTLESS_WORK_FEE_PERCENT,
  totalAfterTrustlessWorkFee,
  type Applicant,
  type JobListing,
} from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { todayIso, usdc } from '@/lib/format';
import { fromUnits, toUnits } from '@/lib/usdc';
import { cn } from '@/lib/utils';

interface MilestoneDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: string;
  dueDate: string;
}

const MAX_MILESTONES = 5;

/**
 * The plan the startup already posted with the job, ready to send. When the
 * specialist offered a different price, every amount moves with it and the last
 * one absorbs the rounding, so the milestones still add up exactly.
 */
function planFrom(job: JobListing | undefined, price: string): MilestoneDraft[] {
  if (!job || job.milestones.length === 0) {
    return [
      { title: '', description: '', acceptanceCriteria: '', amount: price, dueDate: '' },
    ];
  }
  const budget = toUnits(job.budget);
  const agreed = toUnits(price);
  let assigned = BigInt(0);
  return job.milestones.map((milestone, index) => {
    const share =
      index === job.milestones.length - 1
        ? agreed - assigned
        : budget === BigInt(0)
          ? BigInt(0)
          : (toUnits(milestone.amount) * agreed) / budget;
    assigned += share;
    return {
      title: milestone.title,
      description: milestone.description,
      acceptanceCriteria: milestone.acceptanceCriteria,
      amount: fromUnits(share),
      dueDate: milestone.dueDate.slice(0, 10),
    };
  });
}

/**
 * The startup hires an applicant. The milestones come from the job, so the
 * terms are the ones both sides already read; they can still be adjusted if
 * the two of them negotiated something else.
 */
export function HireDialog({
  applicant,
  job,
}: {
  applicant: Applicant;
  job?: JobListing;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(() =>
    planFrom(job, applicant.price),
  );

  const total = milestones.reduce(
    (sum, milestone) => sum + toUnits(milestone.amount),
    BigInt(0),
  );
  const remaining = toUnits(applicant.price) - total;

  const queryClient = useQueryClient();
  const hire = useMutation({
    mutationFn: () =>
      api<{ id: string }>('/contracts', {
        method: 'POST',
        body: {
          applicationId: applicant.id,
          milestones: milestones.map((milestone) => ({
            title: milestone.title.trim(),
            description: milestone.description.trim(),
            ...(milestone.acceptanceCriteria.trim()
              ? { acceptanceCriteria: milestone.acceptanceCriteria.trim() }
              : {}),
            amount: Number(milestone.amount),
            dueDate: milestone.dueDate,
          })),
        },
      }),
    onSuccess: async (contract) => {
      toast.success('Terms sent. The specialist has to accept them.');
      // The job is no longer open and the application is taken.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
        queryClient.invalidateQueries({ queryKey: ['contracts', 'mine'] }),
        queryClient.invalidateQueries({ queryKey: ['applications'] }),
      ]);
      router.push(`/contracts/${contract.id}`);
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function update(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((current) =>
      current.map((m, i) => (i === index ? { ...m, ...patch } : m)),
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remaining !== BigInt(0)) {
      toast.error(`The milestones must add up to ${usdc(applicant.price)}`);
      return;
    }
    hire.mutate();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Hire</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            Hire {applicant.specialist?.displayName ?? 'this specialist'}
          </DialogTitle>
          <DialogDescription>
            Split the agreed {usdc(applicant.price)} into milestones. Each one is paid
            when you approve its delivery.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          {milestones.map((milestone, index) => (
            <div key={index} className="space-y-3 rounded-xl border border-border p-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-navy">Milestone {index + 1}</p>
                {milestones.length > 1 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove milestone"
                    onClick={() =>
                      setMilestones((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                ) : null}
              </div>
              <Input
                placeholder="Title"
                required
                minLength={3}
                maxLength={120}
                value={milestone.title}
                onChange={(event) => update(index, { title: event.target.value })}
              />
              <Textarea
                placeholder="What has to be delivered"
                required
                minLength={10}
                maxLength={2000}
                rows={2}
                value={milestone.description}
                onChange={(event) => update(index, { description: event.target.value })}
              />
              <Textarea
                placeholder="What it has to meet to be approved"
                maxLength={2000}
                rows={2}
                value={milestone.acceptanceCriteria}
                onChange={(event) =>
                  update(index, { acceptanceCriteria: event.target.value })
                }
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  type="number"
                  placeholder="Amount (USDC)"
                  required
                  min={1}
                  step="any"
                  value={milestone.amount}
                  onChange={(event) => update(index, { amount: event.target.value })}
                />
                <Input
                  type="date"
                  required
                  min={todayIso()}
                  value={milestone.dueDate}
                  onChange={(event) => update(index, { dueDate: event.target.value })}
                />
              </div>
            </div>
          ))}

          {milestones.length < MAX_MILESTONES ? (
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setMilestones((current) => [
                  ...current,
                  {
                    title: '',
                    description: '',
                    acceptanceCriteria: '',
                    amount: remaining > BigInt(0) ? fromUnits(remaining) : '',
                    dueDate: '',
                  },
                ])
              }
            >
              <PlusIcon /> Add milestone
            </Button>
          ) : null}

          <p
            className={cn(
              'text-sm',
              remaining === BigInt(0) ? 'text-emerald-700' : 'text-destructive',
            )}
          >
            {remaining === BigInt(0)
              ? 'The milestones add up to the agreed price.'
              : remaining > BigInt(0)
                ? `${usdc(fromUnits(remaining))} still to assign.`
                : `${usdc(fromUnits(-remaining))} over the agreed price.`}
          </p>

          {remaining === BigInt(0) ? (
            <p className="rounded-lg bg-celeste-light/40 px-3 py-2 text-sm text-muted-foreground">
              You fund the full {usdc(applicant.price)}. Trustless Work, which runs the
              escrow, keeps {TRUSTLESS_WORK_FEE_PERCENT}% of each payment, so{' '}
              {applicant.specialist?.displayName ?? 'the specialist'} receives{' '}
              {usdc(
                totalAfterTrustlessWorkFee(
                  milestones.map((milestone) => fromUnits(toUnits(milestone.amount))),
                ),
              )}{' '}
              in total. Pocket charges nothing.
            </p>
          ) : null}

          <DialogFooter>
            <Button type="submit" disabled={hire.isPending || remaining !== BigInt(0)}>
              {hire.isPending ? 'Sending...' : 'Send terms'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
