'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { date } from '@/lib/format';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const INVALID_TOAST = 'invalid-field';

/**
 * Safari on iPhone can stop a form over a field that breaks one of its rules
 * (empty, too short, a date before today) without scrolling to that field or
 * saying what is wrong: the submit button just seems dead. So every form in
 * the app gets the same help, in place of the browser's own bubble: the first
 * field it refuses is brought into view and focused, and a message names it
 * and what to fix.
 */
export function InvalidFieldHelp() {
  useEffect(() => {
    // The browser fires `invalid` at every refused field of a form at once:
    // only the first of each check is pointed at.
    let pointed = false;
    function onInvalid(event: Event) {
      const field = event.target;
      if (
        !(field instanceof HTMLInputElement) &&
        !(field instanceof HTMLTextAreaElement) &&
        !(field instanceof HTMLSelectElement)
      ) {
        return;
      }
      event.preventDefault();
      if (pointed) return;
      pointed = true;
      setTimeout(() => {
        pointed = false;
      }, 0);
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.focus({ preventScroll: true });
      // One message at a time: a second check replaces it instead of stacking.
      toast.error(problemOf(field), { id: INVALID_TOAST });
    }
    // Once a form gets through, what it said to fix no longer applies.
    function onSubmit() {
      toast.dismiss(INVALID_TOAST);
    }
    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
  return null;
}

/** What is wrong with the field, in words, naming it as its label does. */
export function problemOf(field: Control): string {
  const name = `"${labelOf(field)}"`;
  const { validity } = field;
  const type = field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase();

  if (validity.customError) return field.validationMessage;
  if (validity.valueMissing) {
    if (type === 'select') return `Elige una opción en ${name}.`;
    if (type === 'date') return `Elige la fecha en ${name}.`;
    if (type === 'file') return `Adjunta el archivo en ${name}.`;
    if (type === 'checkbox') return `Marca ${name} para seguir.`;
    return `Completa ${name}.`;
  }
  if (validity.tooShort && 'minLength' in field) {
    return `${name} necesita al menos ${field.minLength} caracteres. Lleva ${field.value.length}.`;
  }
  if (validity.tooLong && 'maxLength' in field) {
    return `${name} admite hasta ${field.maxLength} caracteres.`;
  }
  if (validity.rangeUnderflow && field instanceof HTMLInputElement) {
    return type === 'date'
      ? `${name} no puede ser antes del ${date(field.min)}.`
      : `${name} tiene que ser al menos ${field.min}.`;
  }
  if (validity.rangeOverflow && field instanceof HTMLInputElement) {
    return type === 'date'
      ? `${name} no puede ser después del ${date(field.max)}.`
      : `${name} puede ser como máximo ${field.max}.`;
  }
  if (validity.badInput) {
    return type === 'number'
      ? `${name} tiene que ser un número, por ejemplo 12.5.`
      : `Revisa ${name}.`;
  }
  if (validity.typeMismatch && type === 'email') return `Escribe un correo válido en ${name}.`;
  if ((validity.typeMismatch || validity.patternMismatch) && type === 'url') {
    return `Escribe un enlace completo en ${name}, por ejemplo https://tusitio.com.`;
  }
  return `Revisa ${name}.`;
}

/** The field's visible label, else its aria-label or placeholder. */
function labelOf(field: Control): string {
  const label = field.labels?.[0];
  if (label) {
    // The required mark is a child of the label: leave it out.
    const copy = label.cloneNode(true) as HTMLElement;
    copy.querySelectorAll('.text-destructive').forEach((mark) => mark.remove());
    const text = copy.textContent?.trim();
    if (text) return text;
  }
  return (
    field.getAttribute('aria-label') ??
    field.getAttribute('placeholder') ??
    'este campo'
  ).trim();
}
