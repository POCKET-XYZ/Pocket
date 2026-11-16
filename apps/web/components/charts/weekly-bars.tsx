'use client';

import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Twelve weekly columns of one series, with the hovered (or latest) week read
 * out above them, and the full numbers as a table on request.
 */
export function WeeklyBars<Week extends { weekStart: string }>({
  title,
  weeks,
  pick,
  format,
  className,
}: {
  title: string;
  weeks: Week[];
  pick: (week: Week) => number | string;
  format: (value: number | string) => string;
  className?: string;
}) {
  const latest = weeks.length - 1;
  const [selected, setSelected] = useState(latest);
  const values = weeks.map(pick);
  // Heights only: the numbers shown always come from the exact values.
  const heights = values.map(Number);
  const max = Math.max(...heights, 0);
  const shown = weeks[selected] ?? weeks[latest];

  return (
    <div
      className={cn('min-w-0 rounded-2xl border border-border bg-card p-4', className)}
    >
      <h3 className="font-sans text-sm font-medium text-muted-foreground">{title}</h3>
      {shown ? (
        <p className="mt-1 text-sm" aria-live="polite">
          <span className="font-heading text-lg font-bold text-navy">
            {format(values[selected] ?? 0)}
          </span>{' '}
          <span className="text-muted-foreground">
            {selected === latest
              ? 'esta semana'
              : `semana del ${weekLabel(shown.weekStart)}`}
          </span>
        </p>
      ) : null}

      <ChartOrTable title={title} weeks={weeks} values={values} format={format}>
        {max === 0 ? (
          <p className="flex h-28 items-center justify-center text-sm text-muted-foreground">
            Nada en las últimas 12 semanas
          </p>
        ) : (
          <div
            className="mt-3 flex h-28 items-end gap-0.5 border-b border-border"
            onMouseLeave={() => setSelected(latest)}
          >
            {weeks.map((week, index) => (
              <button
                key={week.weekStart}
                type="button"
                aria-label={`Semana del ${weekLabel(week.weekStart)}: ${format(values[index])}`}
                aria-pressed={index === selected}
                onMouseEnter={() => setSelected(index)}
                onFocus={() => setSelected(index)}
                onClick={() => setSelected(index)}
                className="flex h-full min-w-0 flex-1 items-end justify-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span
                  className={cn(
                    'block w-full max-w-6 rounded-t-[4px] transition-colors',
                    index === selected ? 'bg-navy' : 'bg-chart-4/60',
                  )}
                  style={{
                    // A week with anything at all stays visible next to a big one.
                    height:
                      heights[index] > 0
                        ? `max(2px, ${(heights[index] / max) * 100}%)`
                        : 0,
                  }}
                />
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{weeks[0] ? weekLabel(weeks[0].weekStart) : ''}</span>
          <span>Esta semana</span>
        </div>
      </ChartOrTable>
    </div>
  );
}

/**
 * A chart, or its weeks as a table, in the same space: the table takes the
 * height the chart had and scrolls inside it. Opening it never makes the card
 * taller, which would stretch the cards beside it in the same row.
 */
export function ChartOrTable<Week extends { weekStart: string }>({
  title,
  weeks,
  values,
  format,
  children,
}: {
  title: string;
  weeks: Week[];
  values: (number | string)[];
  format: (value: number | string) => string;
  children: React.ReactNode;
}) {
  const chart = useRef<HTMLDivElement>(null);
  // The table's height while it shows; null while the chart does.
  const [height, setHeight] = useState<number | null>(null);

  return (
    <>
      {height === null ? (
        // flow-root keeps the chart's own top margin inside what is measured.
        <div ref={chart} className="flow-root">
          {children}
        </div>
      ) : (
        <div className="mt-3 overflow-y-auto" style={{ height }}>
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card">
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium">Semana del</th>
                <th className="py-1 text-right font-medium">{title}</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {weeks.map((week, index) => (
                <tr key={week.weekStart} className="border-t border-border">
                  <td className="py-1">{weekLabel(week.weekStart)}</td>
                  <td className="py-1 text-right">{format(values[index])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <button
        type="button"
        aria-pressed={height !== null}
        onClick={() =>
          setHeight(
            height === null
              ? // The space the chart had, less the table's own top margin.
                Math.max((chart.current?.offsetHeight ?? 0) - 12, 96)
              : null,
          )
        }
        className="mt-3 text-xs text-muted-foreground hover:text-navy hover:underline"
      >
        {height === null ? 'Ver como tabla' : 'Ver como gráfico'}
      </button>
    </>
  );
}

export function weekLabel(iso: string): string {
  return new Date(iso).toLocaleDateString('es', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
