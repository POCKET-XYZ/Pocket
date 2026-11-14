import { maskPersonalData } from './scrub';

describe('maskPersonalData', () => {
  it('masks emails, phones, wallets, secret keys and links with tokens', () => {
    const text = [
      'Escríbeme a ana.perez@gmail.com o al +591 712 34567.',
      'Mi wallet es GAKQAVC5BET36WWB7L6GOW5J666AF3TLOVDN6L474MLEYPPAK6ZKPJHY',
      'y la de Ethereum 0x52908400098527886E0F7030069857D2E4169EE7.',
      'La clave SBX4ZK2QX7GZ5QH3J6Y2W5Q7QNNX3Q2Y6U7A5WJ5M4XQZ7OZ2W3Q4R5T no la compartas.',
      'Mira https://drive.example.com/file?id=1&token=abc123 para ver.',
    ].join(' ');
    const masked = maskPersonalData(text);
    expect(masked).toContain('[correo]');
    expect(masked).toContain('[teléfono]');
    expect(masked.match(/\[wallet\]/g)).toHaveLength(2);
    expect(masked).toContain('[clave]');
    expect(masked).toContain('[enlace]');
    expect(masked).not.toMatch(/gmail|712|GAKQ|0x5290|SBX4|abc123/);
  });

  it('leaves amounts, counts and plain links alone', () => {
    const text =
      'Presupuesto 1.500.000 Bs, 3 videos de 60 segundos, 12.000 vistas, 2026 y www.pocket.com';
    expect(maskPersonalData(text)).toBe(text);
  });

  it('masks a local mobile number written without spaces', () => {
    expect(maskPersonalData('llámame al 71234567')).toBe('llámame al [teléfono]');
  });
});
