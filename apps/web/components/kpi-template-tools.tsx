'use client';

import type { KpiTemplate, KpiTemplateInput } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { kpiDrafts, kpiInputs, repeatedKpi, type KpiDraft } from '@/components/kpi-rows';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

export const KPI_TEMPLATES_KEY = ['kpi-templates'];

/** The signed-in startup's saved KPI templates. */
export function useKpiTemplates() {
  return useQuery({
    queryKey: KPI_TEMPLATES_KEY,
    queryFn: () => api<KpiTemplate[]>('/kpi-templates'),
  });
}

/** Why these rows cannot be saved as a template, or null. */
export function kpiRowsProblem(kpis: KpiDraft[]): string | null {
  if (kpis.length === 0) return 'Add at least one KPI first';
  if (kpis.some((kpi) => kpi.name.trim().length < 2)) {
    return 'Give every KPI a name of at least 2 characters';
  }
  const repeated = repeatedKpi(kpis);
  return repeated ? `"${repeated}" is listed twice as a KPI` : null;
}

/**
 * On the job form: fill the KPI rows from a saved template, and save the rows
 * as a new one. The rows stay editable after either.
 */
export function KpiTemplateTools({
  kpis,
  onUse,
}: {
  kpis: KpiDraft[];
  onUse: (kpis: KpiDraft[]) => void;
}) {
  const templates = useKpiTemplates();
  const queryClient = useQueryClient();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState('');

  const save = useMutation({
    mutationFn: (body: KpiTemplateInput) =>
      api<KpiTemplate>('/kpi-templates', { method: 'POST', body }),
    onSuccess: async (template) => {
      toast.success(`Saved as "${template.name}"`);
      setNaming(false);
      setName('');
      setChosen(template.id);
      await queryClient.invalidateQueries({ queryKey: KPI_TEMPLATES_KEY });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function use(id: string) {
    setChosen(id);
    const template = templates.data?.find((item) => item.id === id);
    if (!template) return;
    const typed = kpis.some((kpi) => kpi.name.trim() || kpi.target.trim());
    if (typed && !window.confirm(`Replace the KPIs below with "${template.name}"?`)) {
      setChosen('');
      return;
    }
    onUse(kpiDrafts(template.kpis));
  }

  function onSave() {
    const problem = kpiRowsProblem(kpis);
    if (problem) {
      toast.error(problem);
      return;
    }
    if (name.trim().length < 2) {
      toast.error('Give the template a name of at least 2 characters');
      return;
    }
    save.mutate({ name: name.trim(), kpis: kpiInputs(kpis) });
  }

  const list = templates.data ?? [];

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="kpi-template" className="text-sm font-medium text-navy">
          Use a template
        </label>
        <select
          id="kpi-template"
          value={chosen}
          disabled={templates.isLoading || list.length === 0}
          onChange={(event) => use(event.target.value)}
          className="h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm sm:flex-1"
        >
          <option value="">
            {templates.isLoading
              ? 'Loading your templates...'
              : list.length === 0
                ? 'No saved templates yet'
                : 'Choose a template'}
          </option>
          {list.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} ({template.kpis.length} KPI
              {template.kpis.length === 1 ? '' : 's'})
            </option>
          ))}
        </select>
        {!naming ? (
          <Button
            type="button"
            variant="outline"
            disabled={kpis.length === 0}
            onClick={() => setNaming(true)}
          >
            Save as template
          </Button>
        ) : null}
      </div>

      {naming ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            aria-label="Template name"
            placeholder="Template name, e.g. Outbound campaign"
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Inside the job form: Enter saves the template, not the job.
              if (event.key === 'Enter') {
                event.preventDefault();
                onSave();
              }
            }}
            className="min-w-0 sm:flex-1"
          />
          <div className="flex gap-2">
            <Button type="button" disabled={save.isPending} onClick={onSave}>
              {save.isPending ? 'Saving...' : 'Save'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setNaming(false);
                setName('');
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {templates.error
          ? `Your templates could not be loaded: ${errorMessage(templates.error)}`
          : list.length === 0
            ? 'Save the KPIs below to reuse them on your next job.'
            : 'A template fills the rows below; you can still change them for this job.'}{' '}
        <Link href="/profile/kpi-templates" className="underline">
          Manage templates
        </Link>
      </p>
    </div>
  );
}
