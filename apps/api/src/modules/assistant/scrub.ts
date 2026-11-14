/**
 * Personal data people paste anyway, masked before any text leaves Pocket for
 * the model: emails, phone numbers, wallet addresses and secret keys, and
 * links that carry a token. The screen asks people not to paste them; this is
 * what holds when they do.
 */
const RULES: Array<{ pattern: RegExp; mask: string }> = [
  { pattern: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu, mask: '[correo]' },
  // Stellar secret seeds and public keys, and EVM addresses.
  { pattern: /\bS[A-Z2-7]{55}\b/g, mask: '[clave]' },
  { pattern: /\b[GM][A-Z2-7]{55,68}\b/g, mask: '[wallet]' },
  { pattern: /\b0x[a-fA-F0-9]{40}\b/g, mask: '[wallet]' },
  // A link whose query carries something secret.
  {
    pattern: /https?:\/\/\S+[?&](?:token|key|secret|sig|signature|password|pass|auth|code|access_token)=\S*/gi,
    mask: '[enlace]',
  },
];

// Phone numbers: an optional +, then digits in groups separated by spaces,
// dashes or brackets, eight digits or more. Amounts use dots and commas, so
// "1.500.000" is never taken for a phone.
const PHONE = /(?<![\p{L}\p{N}.,])\+?\(?\d[\d\s()-]{6,}\d(?![\p{L}\p{N}]|[.,]\d)/gu;

export function maskPersonalData(text: string): string {
  let masked = text;
  for (const { pattern, mask } of RULES) masked = masked.replace(pattern, mask);
  return masked.replace(PHONE, (match) => {
    const digits = match.replace(/\D/g, '').length;
    return digits >= 8 && digits <= 15 ? '[teléfono]' : match;
  });
}
