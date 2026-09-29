import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IsHttpsUrl } from './is-https-url.decorator';

class Link {
  @IsHttpsUrl()
  url!: string;
}

const errors = (url: string) => validateSync(plainToInstance(Link, { url })).length;

describe('IsHttpsUrl', () => {
  it('accepts an https link', () => {
    expect(errors('https://drive.google.com/file/d/abc/view?usp=sharing')).toBe(0);
  });

  it.each([
    'javascript:alert(document.cookie)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'http://example.com',
    'ftp://example.com/file',
    'example.com',
    '//example.com',
    `https://example.com/${'a'.repeat(2048)}`,
  ])('refuses %s', (url) => {
    expect(errors(url)).toBeGreaterThan(0);
  });
});
