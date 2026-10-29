'use client';

import { ServiceCategory } from '@pocket/shared';
import { CATEGORY_LABELS } from '@/lib/format';
import { cn } from '@/lib/utils';

/** Chips to filter by service category. `null` means all of them. */
export function CategoryFilter({
  value,
  onChange,
}: {
  value: ServiceCategory | null;
  onChange: (value: ServiceCategory | null) => void;
}) {
  const options: (ServiceCategory | null)[] = [null, ...Object.values(ServiceCategory)];
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={option ?? 'all'}
          type="button"
          onClick={() => onChange(option)}
          className={cn(
            'rounded-full border px-3 py-1.5 text-sm transition',
            value === option
              ? 'border-navy bg-navy text-off-white'
              : 'border-border bg-card text-navy hover:border-celeste',
          )}
        >
          {option ? CATEGORY_LABELS[option] : 'Todas'}
        </button>
      ))}
    </div>
  );
}
