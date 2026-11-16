'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { date } from '@/lib/format';

type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

const INVALID_TOAST = 'invalid-field';

function isControl(target: EventTarget | null): target is Control {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  );
}

/**
 * Safari on iPhone can stop a form over a field that breaks one of its rules
 * (empty, too short, a date before today) without scrolling to that field or
 * saying what is wrong: the submit button just seems dead. So every form in
 * the app gets the same help, in place of the browser's own bubble: every
 * refused field turns red with a note right under it saying what to fix, and
 * the first one is brought into view and focused. A note follows what the
 * person types ("Lleva 12") and goes, with the red, once the field is right.
 *
 * A field that shows its own message (UrlInput) is marked with
 * `data-own-message` and only gets the scroll and the focus.
 */
export function InvalidFieldHelp() {
  useEffect(() => {
    // The browser fires `invalid` at every refused field of a form at once:
    // all of them get their note, only the first is scrolled to.
    let pointed = false;
    // Each refused field, with its note and what it had before.
    const marked = new Map<Control, Mark>();

    function unmark(field: Control) {
      const mark = marked.get(field);
      if (!mark) return;
      mark.note.remove();
      restore(field, 'aria-invalid', mark.invalid);
      restore(field, 'aria-describedby', mark.describedBy);
      marked.delete(field);
    }

    function onInvalid(event: Event) {
      const field = event.target;
      if (!isControl(field)) return;
      event.preventDefault();
      const own = field.hasAttribute('data-own-message');
      // Out of sight (a folded section): there is nowhere to show it yet.
      const hidden = field.getClientRects().length === 0;
      if (!own && !hidden) noteUnder(field, marked);
      if (pointed) return;
      pointed = true;
      setTimeout(() => {
        pointed = false;
      }, 0);
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.focus({ preventScroll: true });
      if (hidden && !own) toast.error(problemOf(field), { id: INVALID_TOAST });
      else toast.dismiss(INVALID_TOAST);
    }

    // As the person fixes things, the notes keep up; a field that is right
    // loses its red and its note. Every marked field is looked at, not only
    // the one typed in: a form's own rule can depend on another field (the
    // milestones and the price). After the page has reacted to the change.
    let recheck = 0;
    function onEdit() {
      if (marked.size === 0) return;
      clearTimeout(recheck);
      recheck = window.setTimeout(() => {
        for (const [field, mark] of [...marked]) {
          if (!field.isConnected || field.validity.valid) unmark(field);
          else mark.note.textContent = problemOf(field);
        }
      }, 0);
    }

    // A field taken off the page (a milestone removed, a dialog closed)
    // takes its note with it.
    const observer = new MutationObserver(() => {
      for (const field of [...marked.keys()]) if (!field.isConnected) unmark(field);
    });
    observer.observe(document.body, { childList: true, subtree: true });

    // Once a form gets through, what it said to fix no longer applies.
    function onSubmit() {
      toast.dismiss(INVALID_TOAST);
      for (const field of [...marked.keys()]) unmark(field);
    }

    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      clearTimeout(recheck);
      observer.disconnect();
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);
  return null;
}

interface Mark {
  note: HTMLParagraphElement;
  invalid: string | null;
  describedBy: string | null;
}

let notes = 0;

/** The field in red, with a note under it saying what to fix. */
function noteUnder(field: Control, marked: Map<Control, Mark>) {
  const existing = marked.get(field);
  if (existing) {
    existing.note.textContent = problemOf(field);
    return;
  }
  const note = document.createElement('p');
  note.id = `field-note-${++notes}`;
  note.dataset.fieldNote = '';
  note.className = 'text-sm text-destructive';
  note.textContent = problemOf(field);
  marked.set(field, {
    note,
    invalid: field.getAttribute('aria-invalid'),
    describedBy: field.getAttribute('aria-describedby'),
  });
  field.setAttribute('aria-invalid', 'true');
  field.setAttribute(
    'aria-describedby',
    [field.getAttribute('aria-describedby'), note.id].filter(Boolean).join(' '),
  );
  // Under the field, or under the row it shares with others (amount and
  // date side by side), never beside it.
  let anchor: Element = field;
  while (anchor.parentElement && sideBySide(anchor.parentElement)) {
    anchor = anchor.parentElement;
  }
  anchor.insertAdjacentElement('afterend', note);
  // Close under it, whatever space the form leaves between its rows.
  const parent = anchor.parentElement;
  const rowGap = parent ? parseFloat(getComputedStyle(parent).rowGap) || 0 : 0;
  const margin = parseFloat(getComputedStyle(anchor).marginBottom) || 0;
  note.style.marginTop = `${4 - margin - rowGap}px`;
}

/** Whether a box lays its children out in a row, where a note would land beside the field. */
function sideBySide(box: HTMLElement): boolean {
  if (box.tagName === 'LABEL') return true;
  const style = getComputedStyle(box);
  if (style.display.startsWith('inline')) return true;
  if (style.display.includes('flex')) return !style.flexDirection.startsWith('column');
  if (style.display.includes('grid'))
    return style.gridTemplateColumns.trim().split(/\s+/).length > 1;
  return false;
}

function restore(field: Control, name: string, value: string | null) {
  if (value === null) field.removeAttribute(name);
  else field.setAttribute(name, value);
}

/** What is wrong with the field, in words, naming it as its label does. */
export function problemOf(field: Control): string {
  const name = `"${labelOf(field)}"`;
  const { validity } = field;
  const type =
    field instanceof HTMLInputElement ? field.type : field.tagName.toLowerCase();

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
  if (validity.typeMismatch && type === 'email')
    return `Escribe un correo válido en ${name}.`;
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
