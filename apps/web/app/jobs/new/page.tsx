'use client';

import {
  ServiceCategory,
  type Job,
  type JobKpiInput,
  type JobMilestoneInput,
} from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Field, formValues } from '@/components/form';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError, api, errorMessage } from '@/lib/api';
import { CATEGORY_LABELS, todayIso, usdc } from '@/lib/format';
import { cn } from '@/lib/utils';
import { fromUnits, toUnits } from '@/lib/usdc';
import { useMyProfile } from '@/lib/use-my-profile';

const MAX_MILESTONES = 5;
const MAX_KPIS = 10;

interface KpiDraft {
  name: string;
  target: string;
  unit: string;
}

const EMPTY_KPI: KpiDraft = { name: '', target: '', unit: '' };

interface MilestoneDraft {
  title: string;
  description: string;
  acceptanceCriteria: string;
  amount: string;
  dueDate: string;
}

const EMPTY: MilestoneDraft = {
  title: '',
  description: '',
  acceptanceCriteria: '',
  amount: '',
  dueDate: '',
};

export default function NewJobPage() {
  return (
    <RequireAuth roles={['startup']} verified>
      {() => <ProfileFirst />}
    </RequireAuth>
  );
}

/** Specialists judge a job by the startup behind it: the profile comes first. */
function ProfileFirst() {
  const profile = useMyProfile();
  if (profile.isLoading) return <Loading />;
  if (profile.error) return <ErrorAlert error={profile.error} />;
  if (!profile.data) {
    return (
      <EmptyState title="Fill in your startup profile first">
        Specialists read it before applying.
        <div>
          <Button asChild className="mt-4">
            <Link href="/profile">Create profile</Link>
          </Button>
        </div>
      </EmptyState>
    );
  }
  return <NewJob />;
}

/**
 * Posting a job also means posting how it gets paid. Each milestone says what
 * has to be delivered and what it has to meet to be approved, so a specialist
 * knows exactly what unlocks each payment before applying.
 */
function NewJob() {
  const router = useRouter();
  const [budget, setBudget] = useState('');
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([{ ...EMPTY }]);
  const [kpis, setKpis] = useState<KpiDraft[]>([]);

  const assigned = milestones.reduce((sum, m) => sum + toUnits(m.amount), BigInt(0));
  const remaining = toUnits(budget) - assigned;

  const queryClient = useQueryClient();
  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<Job>('/jobs', { method: 'POST', body }),
    onSuccess: async (job) => {
      toast.success('Job posted');
      await queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.push(`/jobs/${job.id}`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.message.includes('profile')) {
        toast.error(error.message, {
          action: { label: 'Fill in profile', onClick: () => router.push('/profile') },
        });
        return;
      }
      toast.error(errorMessage(error));
    },
  });

  function update(index: number, patch: Partial<MilestoneDraft>) {
    setMilestones((current) =>
      current.map((milestone, i) =>
        i === index ? { ...milestone, ...patch } : milestone,
      ),
    );
  }

  function updateKpi(index: number, patch: Partial<KpiDraft>) {
    setKpis((current) =>
      current.map((kpi, i) => (i === index ? { ...kpi, ...patch } : kpi)),
    );
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (remaining !== BigInt(0)) {
      toast.error(`The milestones must add up to the ${usdc(budget)} budget`);
      return;
    }
    const names = kpis.map((kpi) => kpi.name.trim().toLowerCase());
    const repeated = names.find((name, i) => names.indexOf(name) !== i);
    if (repeated) {
      toast.error(`"${repeated}" is listed twice as a KPI`);
      return;
    }
    const values = formValues(event.currentTarget);
    create.mutate({
      title: values.title,
      description: values.description,
      category: values.category,
      deliverables: values.deliverables,
      budget: Number(budget),
      deadline: values.deadline,
      revisionRounds: Number(values.revisionRounds ?? 1),
      ...(values.channel ? { channel: values.channel } : {}),
      ...(values.contentLanguage ? { contentLanguage: values.contentLanguage } : {}),
      ...(values.startupProvides ? { startupProvides: values.startupProvides } : {}),
      milestones: milestones.map((milestone): JobMilestoneInput => ({
        title: milestone.title.trim(),
        description: milestone.description.trim(),
        acceptanceCriteria: milestone.acceptanceCriteria.trim(),
        amount: Number(milestone.amount),
        dueDate: milestone.dueDate,
      })),
      ...(kpis.length > 0
        ? {
            kpis: kpis.map((kpi): JobKpiInput => ({
              name: kpi.name.trim(),
              ...(kpi.target.trim() ? { target: kpi.target.trim() } : {}),
              ...(kpi.unit.trim() ? { unit: kpi.unit.trim() } : {}),
            })),
          }
        : {}),
    });
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="Post a job"
        description="Say what you need, how it gets paid and what each delivery has to meet. Specialists apply with a proposal and a price."
      />
      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSubmit} className="space-y-4">
            <Field
              label="Title"
              htmlFor="title"
              hint="What you need, in one line."
              required
            >
              <Input id="title" name="title" required minLength={10} maxLength={120} />
            </Field>
            <Field label="Category" htmlFor="category" required>
              <select
                id="category"
                name="category"
                required
                defaultValue=""
                className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              >
                <option value="" disabled>
                  Choose a category
                </option>
                {Object.values(ServiceCategory).map((category) => (
                  <option key={category} value={category}>
                    {CATEGORY_LABELS[category]}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Description"
              htmlFor="description"
              hint="Goal, audience, specs and references. 50 to 5000 characters."
              required
            >
              <Textarea
                id="description"
                name="description"
                required
                minLength={50}
                maxLength={5000}
                rows={6}
                placeholder={
                  'Goal: what this work has to achieve.\nAudience: who it speaks to.\nSpecs: length, format, subtitles, style.\nReferences: links you like.\nDoes the specialist only deliver, or also publish?'
                }
              />
            </Field>
            <Field
              label="Expected deliverables"
              htmlFor="deliverables"
              hint="What you should receive at the end."
              required
            >
              <Textarea
                id="deliverables"
                name="deliverables"
                required
                minLength={10}
                maxLength={2000}
                rows={3}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Budget (USDC)" htmlFor="budget" required>
                <Input
                  id="budget"
                  name="budget"
                  type="number"
                  required
                  min={1}
                  max={1000000}
                  step="any"
                  value={budget}
                  onChange={(event) => setBudget(event.target.value)}
                />
              </Field>
              <Field label="Deadline" htmlFor="deadline" required>
                <Input
                  id="deadline"
                  name="deadline"
                  type="date"
                  required
                  min={todayIso()}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Rounds of changes"
                htmlFor="revisionRounds"
                hint="Included in the price."
              >
                <Input
                  id="revisionRounds"
                  name="revisionRounds"
                  type="number"
                  min={0}
                  max={10}
                  defaultValue={1}
                />
              </Field>
              <Field
                label="Channel"
                htmlFor="channel"
                hint="Where it is published or used."
              >
                <Input
                  id="channel"
                  name="channel"
                  maxLength={120}
                  placeholder="TikTok and Reels"
                />
              </Field>
              <Field label="Content language" htmlFor="contentLanguage">
                <Input
                  id="contentLanguage"
                  name="contentLanguage"
                  maxLength={60}
                  placeholder="Spanish"
                />
              </Field>
            </div>

            <Field
              label="What you provide"
              htmlFor="startupProvides"
              hint="Script, brand, logo, access to the app, anything the specialist can count on."
            >
              <Textarea
                id="startupProvides"
                name="startupProvides"
                maxLength={2000}
                rows={2}
              />
            </Field>

            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-navy">
                  Payment plan
                </h2>
                <p className="text-sm text-muted-foreground">
                  Split the budget into up to {MAX_MILESTONES} deliveries. Each one is
                  paid when you approve it, so the specialist knows what unlocks each
                  payment.
                </p>
              </div>

              {milestones.map((milestone, index) => (
                <div key={index} className="space-y-3 rounded-xl bg-muted/40 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-navy">
                      Milestone {index + 1}
                    </p>
                    {milestones.length > 1 ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Remove milestone"
                        onClick={() =>
                          setMilestones((current) =>
                            current.filter((_, i) => i !== index),
                          )
                        }
                      >
                        <Trash2Icon />
                      </Button>
                    ) : null}
                  </div>
                  <Input
                    placeholder="Title, e.g. Video 1"
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
                    onChange={(event) =>
                      update(index, { description: event.target.value })
                    }
                  />
                  <Textarea
                    placeholder="What it has to meet to be approved, e.g. vertical, 60 seconds, subtitles and the logo"
                    required
                    minLength={10}
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
                      min={0.0000001}
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
                        ...EMPTY,
                        amount: remaining > BigInt(0) ? fromUnits(remaining) : '',
                      },
                    ])
                  }
                >
                  <PlusIcon /> Add milestone
                </Button>
              ) : null}

              {budget ? (
                <p
                  className={cn(
                    'text-sm',
                    remaining === BigInt(0) ? 'text-emerald-700' : 'text-destructive',
                  )}
                >
                  {remaining === BigInt(0)
                    ? 'The milestones add up to the budget.'
                    : remaining > BigInt(0)
                      ? `${usdc(fromUnits(remaining))} of the budget still to assign.`
                      : `${usdc(fromUnits(-remaining))} over the budget.`}
                </p>
              ) : null}
            </section>

            <section className="space-y-3 rounded-2xl border border-border p-4">
              <div>
                <h2 className="font-heading text-lg font-semibold text-navy">
                  How you will measure it{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    (optional)
                  </span>
                </h2>
                <p className="text-sm text-muted-foreground">
                  Up to {MAX_KPIS} KPIs. Applicants see them before applying, and every
                  delivery reports a result for each one.
                </p>
              </div>

              {kpis.map((kpi, index) => (
                <div
                  key={index}
                  className="flex items-start gap-2 rounded-xl bg-muted/40 p-3"
                >
                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[2fr_1.5fr_1fr]">
                    <Input
                      aria-label={`KPI ${index + 1} name`}
                      placeholder="Name, e.g. Qualified leads"
                      required
                      minLength={2}
                      maxLength={80}
                      value={kpi.name}
                      onChange={(event) => updateKpi(index, { name: event.target.value })}
                    />
                    <Input
                      aria-label={`KPI ${index + 1} target`}
                      placeholder="Target, e.g. 50 per month"
                      maxLength={80}
                      value={kpi.target}
                      onChange={(event) =>
                        updateKpi(index, { target: event.target.value })
                      }
                    />
                    <Input
                      aria-label={`KPI ${index + 1} unit`}
                      placeholder="Unit, e.g. leads"
                      maxLength={30}
                      value={kpi.unit}
                      onChange={(event) => updateKpi(index, { unit: event.target.value })}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Remove KPI"
                    onClick={() =>
                      setKpis((current) => current.filter((_, i) => i !== index))
                    }
                  >
                    <Trash2Icon />
                  </Button>
                </div>
              ))}

              {kpis.length < MAX_KPIS ? (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setKpis((current) => [...current, { ...EMPTY_KPI }])}
                >
                  <PlusIcon /> Add KPI
                </Button>
              ) : null}
            </section>

            <Button type="submit" size="lg" disabled={create.isPending}>
              {create.isPending ? 'Posting...' : 'Post job'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
