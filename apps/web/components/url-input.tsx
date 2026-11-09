'use client';

import { useId, useState } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from 'cn';

/**
 * A link as people paste it, as the API takes it: no spaces around it, and
 * always https. "pocket.com" and "http://pocket.com" both become
 * "https://pocket.com"; an empty field stays empty.
 */
export function normalizeUrl(value: string): string {
  const text = value.trim();
  if (!text) return '';
  if (/^https:\/\//i.test(text)) return `https://${text.slice('https://'.length)}`;
  if (/^http:\/\//i.test(text)) return `https://${text.slice('http://'.length)}`;
  // Another scheme ("ftp://", "mailto:") is left as typed, for the check to name.
  if (/^[a-z][a-z0-9+.-]*:/i.test(text) && !/^[^:]+:\d/.test(text)) return text;
  return `https://${text.replace(/^\/+/, '')}`;
}

/**
 * What the API takes as a link: https, a host with a domain, no spaces. The
 * browser's own check for type="url" lets "https://mi cv en drive" through.
 * Escaped for the `v` flag browsers compile patterns with.
 */
const HTTPS_LINK = String.raw`https://[^\s\/?#]+\.[^\s\/?#]+(?:[\/?#]\S*)?`;

function problemOf(input: HTMLInputElement): string | null {
  if (input.validity.valid) return null;
  if (input.validity.valueMissing) return 'Pega aquí el enlace.';
  return 'Escribe un enlace completo, por ejemplo https://tusitio.com';
}

/**
 * An https link field. When the person leaves it, the link is cleaned up
 * (see normalizeUrl); a link that still does not work is named under the
 * field in Spanish, instead of the browser's own bubble. Works with both
 * `defaultValue` and controlled `value`/`onChange`.
 */
export function UrlInput({
  className,
  onBlur,
  onInput,
  onInvalid,
  ...props
}: Omit<React.ComponentProps<'input'>, 'type' | 'pattern' | 'title'>) {
  const [problem, setProblem] = useState<string | null>(null);
  const messageId = useId();

  return (
    <div className={cn('w-full min-w-0 space-y-1', className)}>
      <Input
        {...props}
        type="url"
        inputMode="url"
        autoComplete="url"
        pattern={HTTPS_LINK}
        aria-invalid={problem ? true : undefined}
        aria-describedby={problem ? messageId : props['aria-describedby']}
        onBlur={(event) => {
          const input = event.currentTarget;
          const clean = normalizeUrl(input.value);
          if (clean !== input.value) {
            // Through the native setter and an input event, so a controlled
            // field's onChange sees the new value too.
            Object.getOwnPropertyDescriptor(
              HTMLInputElement.prototype,
              'value',
            )?.set?.call(input, clean);
            input.dispatchEvent(new Event('input', { bubbles: true }));
          }
          // An empty required field is named when the form is sent, not on the way past.
          setProblem(clean ? problemOf(input) : null);
          onBlur?.(event);
        }}
        onInput={(event) => {
          if (problem && event.currentTarget.validity.valid) setProblem(null);
          onInput?.(event);
        }}
        onInvalid={(event) => {
          const input = event.currentTarget;
          // The message goes under the field instead of the browser's bubble.
          event.preventDefault();
          setProblem(problemOf(input));
          const firstInvalid = input.form?.querySelector(
            'input:invalid, textarea:invalid, select:invalid',
          );
          if (!input.form || firstInvalid === input) input.focus();
          onInvalid?.(event);
        }}
      />
      {problem ? (
        <p id={messageId} className="text-sm text-destructive">
          {problem}
        </p>
      ) : null}
    </div>
  );
}
