'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { cn } from 'cn';
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
 * refused field turns red, the first one is brought into view and focused,
 * and a note under it says what to fix. The note follows what the person
 * types ("Lleva 12") and goes away, with the red, once the field is right.
 *
 * A field that shows its own message (UrlInput) is marked with
 * `data-own-message` and only gets the scroll and the focus.
 */
export function InvalidFieldHelp() {
  const [note, setNote] = useState<{ field: Control; message: string } | null>(null);
  const clear = useCallback(() => setNote(null), []);

  useEffect(() => {
    // The browser fires `invalid` at every refused field of a form at once:
    // all of them turn red, only the first is pointed at.
    let pointed = false;
    // What each marked field had as aria-invalid before, to put it back.
    const marked = new Map<Control, string | null>();

    function unmark(field: Control) {
      if (!marked.has(field)) return;
      const before = marked.get(field) ?? null;
      if (before === null) field.removeAttribute('aria-invalid');
      else field.setAttribute('aria-invalid', before);
      marked.delete(field);
    }

    function onInvalid(event: Event) {
      const field = event.target;
      if (!isControl(field)) return;
      event.preventDefault();
      // Fields of a dialog that closed are gone: forget them.
      for (const old of [...marked.keys()]) if (!old.isConnected) marked.delete(old);
      const own = field.hasAttribute('data-own-message');
      if (!own) {
        if (!marked.has(field)) marked.set(field, field.getAttribute('aria-invalid'));
        field.setAttribute('aria-invalid', 'true');
      }
      if (pointed) return;
      pointed = true;
      setTimeout(() => {
        pointed = false;
      }, 0);
      field.scrollIntoView({ block: 'center', behavior: 'smooth' });
      field.focus({ preventScroll: true });
      if (own) {
        toast.dismiss(INVALID_TOAST);
        setNote(null);
      } else if (field.getClientRects().length === 0) {
        // Not on screen (a folded section): a message at the top instead.
        toast.error(problemOf(field), { id: INVALID_TOAST });
        setNote(null);
      } else {
        toast.dismiss(INVALID_TOAST);
        setNote({ field, message: problemOf(field) });
      }
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
        for (const field of [...marked.keys()]) {
          if (!field.isConnected) marked.delete(field);
          else if (field.validity.valid) unmark(field);
        }
        setNote((current) => {
          if (!current) return current;
          if (!marked.has(current.field)) return null;
          const message = problemOf(current.field);
          return message === current.message
            ? current
            : { field: current.field, message };
        });
      }, 0);
    }

    // Moving on to another field hides the note; the red stays until fixed.
    function onFocus(event: Event) {
      const target = event.target;
      if (!isControl(target)) return;
      setNote((current) => (current && current.field !== target ? null : current));
    }

    // Once a form gets through, what it said to fix no longer applies.
    function onSubmit() {
      toast.dismiss(INVALID_TOAST);
      setNote(null);
      for (const field of [...marked.keys()]) unmark(field);
    }

    document.addEventListener('invalid', onInvalid, true);
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    document.addEventListener('focusin', onFocus, true);
    document.addEventListener('submit', onSubmit, true);
    return () => {
      clearTimeout(recheck);
      document.removeEventListener('invalid', onInvalid, true);
      document.removeEventListener('input', onEdit, true);
      document.removeEventListener('change', onEdit, true);
      document.removeEventListener('focusin', onFocus, true);
      document.removeEventListener('submit', onSubmit, true);
    };
  }, []);

  return note ? (
    <FieldNote field={note.field} message={note.message} onGone={clear} />
  ) : null;
}

interface Place {
  top: number;
  left: number;
  width: number;
  /** Where the arrow sits, from the note's left edge. */
  arrow: number;
  above: boolean;
  shown: boolean;
}

/**
 * The note under a refused field, with an arrow pointing at it. It lives on
 * top of everything (dialogs included) and follows the field as the page or
 * a dialog scrolls; it goes over the field when there is no room below, as
 * with the phone's keyboard open, and hides while the field is scrolled out
 * of sight.
 */
function FieldNote({
  field,
  message,
  onGone,
}: {
  field: Control;
  message: string;
  onGone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<Place | null>(null);

  useLayoutEffect(() => {
    let frame = 0;
    let last = '';
    function follow() {
      if (!field.isConnected) {
        onGone();
        return;
      }
      // A field hidden for screen readers only (a file picker inside its
      // button) is pointed at through what wraps it.
      let anchor: Element = field;
      while (anchor.parentElement && anchor.getBoundingClientRect().width < 4) {
        anchor = anchor.parentElement;
      }
      const box = anchor.getBoundingClientRect();
      const view = window.visualViewport;
      const viewTop = view?.offsetTop ?? 0;
      const viewBottom = viewTop + (view?.height ?? window.innerHeight);
      const viewWidth = document.documentElement.clientWidth;
      const height = ref.current?.offsetHeight ?? 40;
      const above =
        box.bottom + 8 + height > viewBottom && box.top - 8 - height > viewTop;
      const width = Math.min(Math.max(box.width, 240), viewWidth - 16);
      const left = Math.min(Math.max(box.left, 8), viewWidth - 8 - width);
      const next: Place = {
        top: above ? box.top - 8 : box.bottom + 8,
        left,
        width,
        // Under the field's left edge, where its text starts.
        arrow: Math.min(Math.max(box.left - left + 16, 12), width - 24),
        above,
        shown: inSight(anchor, box, viewTop, viewBottom),
      };
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setPlace(next);
      }
      frame = requestAnimationFrame(follow);
    }
    follow();
    return () => cancelAnimationFrame(frame);
  }, [field, onGone]);

  return createPortal(
    <div
      ref={ref}
      role="alert"
      data-field-note=""
      style={{
        top: place?.top ?? -9999,
        left: place?.left ?? 0,
        maxWidth: place?.width,
        transform: place?.above ? 'translateY(-100%)' : undefined,
      }}
      className={cn(
        'pointer-events-none fixed z-[100] flex w-max items-start gap-2 rounded-lg border border-destructive/40 bg-popover px-3 py-2 text-sm text-foreground shadow-lg transition-opacity',
        place?.shown ? 'opacity-100' : 'opacity-0',
      )}
    >
      <span
        aria-hidden="true"
        className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-destructive text-[11px] font-bold leading-none text-white"
      >
        !
      </span>
      <span>{message}</span>
      <span
        aria-hidden="true"
        style={{ left: place?.arrow ?? 16 }}
        className={cn(
          'absolute size-2.5 rotate-45 border-destructive/40 bg-popover',
          place?.above
            ? '-bottom-[6px] border-r border-b'
            : '-top-[6px] border-l border-t',
        )}
      />
    </div>,
    document.body,
  );
}

/** Whether the middle of the field shows on screen and in every box that scrolls around it. */
function inSight(
  anchor: Element,
  box: DOMRect,
  viewTop: number,
  viewBottom: number,
): boolean {
  const x = box.left + box.width / 2;
  const y = box.top + Math.min(box.height / 2, 12);
  if (y < viewTop || y > viewBottom) return false;
  for (let parent = anchor.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent);
    if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
    const clip = parent.getBoundingClientRect();
    if (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom) return false;
  }
  return true;
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
