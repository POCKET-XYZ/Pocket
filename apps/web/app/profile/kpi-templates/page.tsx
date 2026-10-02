'use client';

import type { KpiTemplate, KpiTemplateInput } from '@pocket/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PlusIcon } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  KPI_TEMPLATES_KEY,
  kpiRowsProblem,
  useKpiTemplates,
} from '@/components/kpi-template-tools';
import {
  EMPTY_KPI,
  KpiRows,
  MAX_KPIS,
  kpiDrafts,
  kpiInputs,
  type KpiDraft,
} from '@/components/kpi-rows';
import { EmptyState, ErrorAlert, Loading, PageHeader } from '@/components/page';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { api, errorMessage } from '@/lib/api';

/** The most templates a startup can keep, as the API checks it. */
const MAX_TEMPLATES = 20;

export default function KpiTemplatesPage() {
  return (
    <RequireAuth roles={['startup']} verified>
      {() => <KpiTemplates />}
    </RequireAuth>
  );
}

function KpiTemplates() {
  const templates = useKpiTemplates();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const list = templates.data ?? [];
  const full = list.length >= MAX_TEMPLATES;

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader
        title="KPI templates"
        description="Sets of KPIs you reuse when posting jobs. Choosing one on the job form fills the KPIs, and you can still change them for that job. Changing a template never changes a job already posted."
        actions={
          <Button asChild variant="outline">
            <Link href="/profile">Back to profile</Link>
          </Button>
        }
      />

      {templates.isLoading ? (
        <Loading />
      ) : templates.error ? (
        <ErrorAlert error={templates.error} />
      ) : (
        <div className="space-y-4">
          {creating ? (
            <Card>
              <CardContent className="pt-6">
                <TemplateEditor onDone={() => setCreating(false)} />
              </CardContent>
            </Card>
          ) : full ? (
            <p className="text-sm text-muted-foreground">
              You have {MAX_TEMPLATES} templates, the most you can keep. Delete one to add
              another.
            </p>
          ) : (
            <Button
              onClick={() => {
                setEditing(null);
                setCreating(true);
              }}
            >
              <PlusIcon /> New template
            </Button>
          )}

          {list.length === 0 && !creating ? (
            <EmptyState title="No KPI templates yet">
              Create one here, or use &quot;Save as template&quot; on the KPIs of the job
              form.
              <div>
                <Button asChild variant="outline" className="mt-4">
                  <Link href="/jobs/new">Post a job</Link>
                </Button>
              </div>
            </EmptyState>
          ) : null}

          {list.map((template) => (
            <Card key={template.id}>
              <CardContent className="pt-6">
                {editing === template.id ? (
                  <TemplateEditor template={template} onDone={() => setEditing(null)} />
                ) : (
                  <TemplateView
                    template={template}
                    onEdit={() => {
                      setCreating(false);
                      setEditing(template.id);
                    }}
                  />
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function TemplateView({
  template,
  onEdit,
}: {
  template: KpiTemplate;
  onEdit: () => void;
}) {
  const queryClient = useQueryClient();
  const remove = useMutation({
    mutationFn: () => api(`/kpi-templates/${template.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      toast.success('Template deleted');
      await queryClient.invalidateQueries({ queryKey: KPI_TEMPLATES_KEY });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h2 className="break-words font-heading text-lg font-semibold text-navy">
            {template.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            {template.kpis.length} KPI{template.kpis.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="outline" onClick={onEdit}>
            Edit
          </Button>
          <Button
            variant="ghost"
            disabled={remove.isPending}
            onClick={() => {
              if (
                window.confirm(
                  `Delete "${template.name}"? Jobs already posted with it keep their KPIs.`,
                )
              )
                remove.mutate();
            }}
          >
            {remove.isPending ? 'Deleting...' : 'Delete'}
          </Button>
        </div>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border text-sm">
        {template.kpis.map((kpi) => (
          <li
            key={kpi.name}
            className="flex flex-col gap-0.5 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
          >
            <span className="break-words font-medium text-navy">{kpi.name}</span>
            <span className="break-words text-muted-foreground">
              Target: {kpi.target ?? 'No target set'}
              {kpi.unit ? ` (${kpi.unit})` : ''}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Create a template, or rename one and change its KPIs. */
function TemplateEditor({
  template,
  onDone,
}: {
  template?: KpiTemplate;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(template?.name ?? '');
  const [kpis, setKpis] = useState<KpiDraft[]>(
    template ? kpiDrafts(template.kpis) : [{ ...EMPTY_KPI }],
  );

  const save = useMutation({
    mutationFn: (body: KpiTemplateInput) =>
      template
        ? api<KpiTemplate>(`/kpi-templates/${template.id}`, { method: 'PUT', body })
        : api<KpiTemplate>('/kpi-templates', { method: 'POST', body }),
    onSuccess: async () => {
      toast.success(template ? 'Template saved' : 'Template created');
      await queryClient.invalidateQueries({ queryKey: KPI_TEMPLATES_KEY });
      onDone();
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = kpiRowsProblem(kpis);
    if (problem) {
      toast.error(problem);
      return;
    }
    save.mutate({ name: name.trim(), kpis: kpiInputs(kpis) });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label
          htmlFor={`template-name-${template?.id ?? 'new'}`}
          className="text-sm font-medium text-navy"
        >
          Name
        </label>
        <Input
          id={`template-name-${template?.id ?? 'new'}`}
          required
          minLength={2}
          maxLength={80}
          placeholder="e.g. Outbound campaign"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Up to {MAX_KPIS} KPIs, each name once.
      </p>
      <KpiRows kpis={kpis} onChange={setKpis} />
      <div className="flex flex-wrap gap-2 border-t border-border pt-3">
        <Button type="submit" disabled={save.isPending}>
          {save.isPending ? 'Saving...' : template ? 'Save template' : 'Create template'}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
