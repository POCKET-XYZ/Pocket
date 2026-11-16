import { Fragment } from 'react';

/**
 * An email that, when it does not fit on one line, wraps after a dot, a dash
 * or an underscore, or before the @, instead of in the middle of a word:
 * "elias.soria.juan." / "manuel@gmail.com". Only a part longer than the
 * whole line is still split (overflow-wrap on the body).
 */
export function EmailText({ email }: { email: string }) {
  const parts: string[] = [];
  let current = '';
  for (const char of email) {
    if (char === '@' && current) {
      parts.push(current);
      current = '';
    }
    current += char;
    if (char === '.' || char === '-' || char === '_') {
      parts.push(current);
      current = '';
    }
  }
  if (current) parts.push(current);
  return (
    <span title={email}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          {part}
        </Fragment>
      ))}
    </span>
  );
}
