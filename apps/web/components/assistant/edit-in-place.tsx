'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface EditField {
  key: string;
  label: string;
  value: string;
  multiline?: boolean;
  /** A number, like a milestone's amount. */
  numeric?: boolean;
}

/**
 * A suggested part edited right in its card, before it goes to the form: the
 * person stays where they are reading, instead of being sent to a field
 * further down the page. "Listo" hands the edited values over.
 */
export function EditInPlace({
  fields,
  onDone,
  onCancel,
}: {
  fields: EditField[];
  onDone: (values: Record<string, string>) => void;
  onCancel: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(fields.map((field) => [field.key, field.value])),
  );
  const first = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const single = fields.length === 1;

  return (
    <div className="space-y-2">
      {fields.map((field, index) => {
        const props = {
          ref: index === 0 ? first : undefined,
          'aria-label': field.label,
          value: values[field.key] ?? '',
          onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
            setValues((current) => ({ ...current, [field.key]: event.target.value })),
        };
        return (
          <label key={field.key} className="block space-y-1">
            {single ? null : (
              <span className="text-xs font-semibold text-navy">{field.label}</span>
            )}
            {field.multiline ? (
              <Textarea rows={3} {...props} />
            ) : (
              <Input
                {...props}
                {...(field.numeric
                  ? { type: 'number', inputMode: 'decimal' as const, step: 'any', min: 0 }
                  : {})}
              />
            )}
          </label>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => onDone(values)}>
          Listo
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
