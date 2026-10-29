'use client';

import type { KpiTemplate, KpiTemplateInput } from '@pocket/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { kpiDrafts, kpiInputs, repeatedKpi, type KpiDraft } from '@/components/kpi-rows';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/confirm-dialog';
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
  if (kpis.length === 0) return 'Primero agrega al menos un KPI';
  if (kpis.some((kpi) => kpi.name.trim().length < 2)) {
    return 'Cada KPI necesita un nombre de al menos 2 caracteres';
  }
  const repeated = repeatedKpi(kpis);
  return repeated ? `"${repeated}" aparece dos veces como KPI` : null;
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
  const confirm = useConfirm();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [chosen, setChosen] = useState('');

  const save = useMutation({
    mutationFn: (body: KpiTemplateInput) =>
      api<KpiTemplate>('/kpi-templates', { method: 'POST', body }),
    onSuccess: async (template) => {
      toast.success(`Guardada como "${template.name}"`);
      setNaming(false);
      setName('');
      setChosen(template.id);
      await queryClient.invalidateQueries({ queryKey: KPI_TEMPLATES_KEY });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });

  async function use(id: string) {
    setChosen(id);
    const template = templates.data?.find((item) => item.id === id);
    if (!template) return;
    const typed = kpis.some((kpi) => kpi.name.trim() || kpi.target.trim());
    if (
      typed &&
      !(await confirm({
        title: `¿Reemplazar los KPIs de abajo por los de "${template.name}"?`,
        confirmText: 'Reemplazar',
      }))
    ) {
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
      toast.error('La plantilla necesita un nombre de al menos 2 caracteres');
      return;
    }
    save.mutate({ name: name.trim(), kpis: kpiInputs(kpis) });
  }

  const list = templates.data ?? [];

  return (
    <div className="space-y-2 rounded-xl border border-dashed border-border p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <label htmlFor="kpi-template" className="text-sm font-medium text-navy">
          Usar una plantilla
        </label>
        <select
          id="kpi-template"
          value={chosen}
          disabled={templates.isLoading || list.length === 0}
          onChange={(event) => void use(event.target.value)}
          className="h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm sm:flex-1"
        >
          <option value="">
            {templates.isLoading
              ? 'Cargando tus plantillas...'
              : list.length === 0
                ? 'Todavía no tienes plantillas guardadas'
                : 'Elige una plantilla'}
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
            Guardar como plantilla
          </Button>
        ) : null}
      </div>

      {naming ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            autoFocus
            aria-label="Nombre de la plantilla"
            placeholder="Nombre de la plantilla, por ejemplo Campaña outbound"
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
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setNaming(false);
                setName('');
              }}
            >
              Cancelar
            </Button>
          </div>
        </div>
      ) : null}

      <p className="text-xs text-muted-foreground">
        {templates.error
          ? `No se pudieron cargar tus plantillas: ${errorMessage(templates.error)}`
          : list.length === 0
            ? 'Guarda los KPIs de abajo para reutilizarlos en tu próximo trabajo.'
            : 'Una plantilla completa las filas de abajo; igual puedes cambiarlas para este trabajo.'}{' '}
        <Link href="/profile/kpi-templates" className="underline">
          Administrar plantillas
        </Link>
      </p>
    </div>
  );
}
